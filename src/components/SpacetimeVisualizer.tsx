import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { RotateCcw, Settings, Zap } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as THREE from "three";

interface SpaceObject {
  _id: Id<"spaceObjects">;
  type: string;
  mass: number;
  position: { x: number; y: number; z: number };
  name?: string;
}

const OBJECT_TYPES = {
  spaceship: { mass: 0.000001, color: 0x00ff88, size: 0.1 },
  planet: { mass: 1, color: 0x4488ff, size: 0.3 },
  star: { mass: 100, color: 0xffaa00, size: 0.5 },
  neutronstar: { mass: 1000, color: 0xff4444, size: 0.2 },
  blackhole: { mass: 10000, color: 0x000000, size: 0.4 },
};

export default function SpacetimeVisualizer() {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const gridRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null>(null);
  const heatmapRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial> | null>(null);
  const objectsRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [selectedObjectType, setSelectedObjectType] = useState<keyof typeof OBJECT_TYPES>("planet");
  const [showGeodesics, setShowGeodesics] = useState(false);
  const [showEducational, setShowEducational] = useState(false);
  const [selectedObject, setSelectedObject] = useState<SpaceObject | null>(null);
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0)); // orbit target
  const sphericalRef = useRef<THREE.Spherical>(new THREE.Spherical(15, Math.PI / 3, 0)); // radius, phi, theta
  const gridExtentRef = useRef<number>(20); // track plane half-extent for reference potential

  const objects = useQuery(api.objects.getUserObjects) || [];
  const createObject = useMutation(api.objects.createObject);
  const updateObjectMass = useMutation(api.objects.updateObjectMass);
  const deleteObject = useMutation(api.objects.deleteObject);
  const clearAllObjects = useMutation(api.objects.clearAllObjects);

  // Store original plane positions to reset before recomputing curvature
  const basePositionsRef = useRef<Float32Array | null>(null);
  // Targets for smooth animation of curvature (Y positions + colors)
  const targetYRef = useRef<Float32Array | null>(null);
  const targetColorsRef = useRef<Float32Array | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Position from spherical
    {
      const pos = new THREE.Vector3().setFromSpherical(sphericalRef.current).add(targetRef.current);
      camera.position.copy(pos);
      camera.lookAt(targetRef.current);
    }
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(window.innerWidth * 0.7, window.innerHeight * 0.8);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Create spacetime grid (as a deformable plane wireframe)
    const gridSize = 20;
    const gridDivisions = 100; // higher for smoother curvature
    const planeGeom = new THREE.PlaneGeometry(gridSize * 2, gridSize * 2, gridDivisions, gridDivisions);
    // Rotate into XZ plane so Y is "depth" for curvature
    planeGeom.rotateX(-Math.PI / 2);
    gridExtentRef.current = gridSize; // remember extent for reference potential

    const gridMaterial = new THREE.MeshBasicMaterial({
      color: 0x444444,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
    const gridMesh = new THREE.Mesh(planeGeom, gridMaterial);
    gridRef.current = gridMesh;
    scene.add(gridMesh);

    // Add a semi-transparent colored surface using the same geometry for curvature heatmap
    {
      // Ensure the geometry has a color attribute
      const geom = planeGeom;
      const vertexCount = (geom.attributes.position as THREE.BufferAttribute).count;
      if (!geom.getAttribute("color")) {
        const colors = new Float32Array(vertexCount * 3);
        geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      }

      const heatmapMaterial = new THREE.MeshLambertMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      // Prevent the heatmap surface from occluding objects
      heatmapMaterial.depthWrite = false;

      const heatmapMesh = new THREE.Mesh(geom, heatmapMaterial);
      // Draw beneath other meshes
      heatmapMesh.renderOrder = -1;
      heatmapRef.current = heatmapMesh;
      scene.add(heatmapMesh);
    }

    // Cache base positions for curvature reset
    {
      const posAttr = planeGeom.attributes.position as THREE.BufferAttribute;
      basePositionsRef.current = new Float32Array(posAttr.array as ArrayLike<number>);
    }

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Mouse controls
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let dragButton: number | null = null;

    const updateCameraFromSpherical = () => {
      if (!cameraRef.current) return;
      const spherical = sphericalRef.current;
      // Clamp phi to avoid flipping through poles
      const minPhi = 0.05;
      const maxPhi = Math.PI - 0.05;
      spherical.phi = Math.min(Math.max(spherical.phi, minPhi), maxPhi);

      const newPos = new THREE.Vector3().setFromSpherical(spherical).add(targetRef.current);
      cameraRef.current.position.copy(newPos);
      cameraRef.current.lookAt(targetRef.current);
    };

    const handleMouseDown = (event: MouseEvent) => {
      isDragging = true;
      dragButton = event.button;
      previousMousePosition = { x: event.clientX, y: event.clientY };
      // Recompute spherical from current camera-target on interaction start
      if (cameraRef.current) {
        const offset = cameraRef.current.position.clone().sub(targetRef.current);
        sphericalRef.current.setFromVector3(offset);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging || !cameraRef.current) return;

      const deltaX = event.clientX - previousMousePosition.x;
      const deltaY = event.clientY - previousMousePosition.y;
      previousMousePosition = { x: event.clientX, y: event.clientY };

      const orbitSpeed = 0.005;
      const panSpeed = 0.002 * sphericalRef.current.radius;

      // Shift-drag -> pan (with any mouse button)
      if (event.shiftKey) {
        const camera = cameraRef.current;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(dir, up).normalize();
        const actualUp = new THREE.Vector3().crossVectors(right, dir).normalize();

        const pan = new THREE.Vector3()
          .addScaledVector(right, -deltaX * panSpeed)
          .addScaledVector(actualUp, deltaY * panSpeed);

        targetRef.current.add(pan);
        camera.position.add(pan);
        // Keep spherical consistent with new camera-target
        const offset = camera.position.clone().sub(targetRef.current);
        sphericalRef.current.setFromVector3(offset);
        camera.lookAt(targetRef.current);
        return;
      }

      // Left-drag or Right-drag -> orbit (azimuth + elevation)
      if (dragButton === 0 || dragButton === 2) {
        sphericalRef.current.theta -= deltaX * orbitSpeed;
        sphericalRef.current.phi -= deltaY * orbitSpeed;
        updateCameraFromSpherical();
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      dragButton = null;
    };

    const handleWheel = (event: WheelEvent) => {
      const zoomFactor = 1 + Math.sign(event.deltaY) * 0.1;
      const spherical = sphericalRef.current;
      spherical.radius *= zoomFactor;
      spherical.radius = Math.min(Math.max(spherical.radius, 2), 80);
      updateCameraFromSpherical();
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Prevent default context menu to allow right-click panning
      e.preventDefault();
    };

    // Resize handling for better responsiveness
    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current || !canvasRef.current) return;
      const parent = canvasRef.current.parentElement;
      const width = parent ? parent.clientWidth : window.innerWidth * 0.7;
      const height = parent ? parent.clientHeight : window.innerHeight * 0.8;
      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    };

    canvasRef.current.addEventListener('mousedown', handleMouseDown);
    canvasRef.current.addEventListener('mousemove', handleMouseMove);
    canvasRef.current.addEventListener('mouseup', handleMouseUp);
    canvasRef.current.addEventListener('wheel', handleWheel, { passive: true });
    canvasRef.current.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('resize', handleResize);
    handleResize();

    // Animation loop with smooth interpolation towards target curvature
    const animate = () => {
      requestAnimationFrame(animate);

      // Smoothly interpolate grid Y positions and vertex colors to targets
      const grid = gridRef.current;
      if (grid) {
        const geom = grid.geometry;
        const pos = geom.attributes.position as THREE.BufferAttribute;
        const colorsAttr = geom.getAttribute("color") as THREE.BufferAttribute | undefined;

        const targetY = targetYRef.current;
        const targetColors = targetColorsRef.current;

        // Interpolation factor (0..1), higher is faster
        const alpha = 0.12;

        if (targetY && pos && pos.count === targetY.length) {
          for (let i = 0; i < pos.count; i++) {
            const curY = pos.getY(i);
            const tgtY = targetY[i];
            pos.setY(i, curY + (tgtY - curY) * alpha);
          }
          pos.needsUpdate = true;
          geom.computeBoundingSphere();
        }

        if (colorsAttr && targetColors && colorsAttr.count * 3 === targetColors.length) {
          for (let i = 0; i < colorsAttr.count; i++) {
            const cr = colorsAttr.getX(i);
            const cg = colorsAttr.getY(i);
            const cb = colorsAttr.getZ(i);
            const tr = targetColors[i * 3 + 0];
            const tg = targetColors[i * 3 + 1];
            const tb = targetColors[i * 3 + 2];

            colorsAttr.setX(i, cr + (tr - cr) * alpha);
            colorsAttr.setY(i, cg + (tg - cg) * alpha);
            colorsAttr.setZ(i, cb + (tb - cb) * alpha);
          }
          colorsAttr.needsUpdate = true;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('mousedown', handleMouseDown);
        canvasRef.current.removeEventListener('mousemove', handleMouseMove);
        canvasRef.current.removeEventListener('mouseup', handleMouseUp);
        canvasRef.current.removeEventListener('wheel', handleWheel as any);
        canvasRef.current.removeEventListener('contextmenu', handleContextMenu);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Update objects in scene
  useEffect(() => {
    if (!sceneRef.current) return;

    // Clear existing objects
    objectsRef.current.forEach((mesh) => {
      sceneRef.current?.remove(mesh);
    });
    objectsRef.current.clear();

    // Add current objects
    objects.forEach((obj) => {
      const objectType = OBJECT_TYPES[obj.type as keyof typeof OBJECT_TYPES];
      if (!objectType) return;

      const geometry = new THREE.SphereGeometry(objectType.size, 32, 32);

      // Improve black hole visibility and affordance
      const isBlackHole = obj.type === "blackhole";
      const material = isBlackHole
        ? new THREE.MeshStandardMaterial({
            color: 0x000000,
            emissive: 0x222222,
            emissiveIntensity: 0.25,
            metalness: 0.85,
            roughness: 0.2,
          })
        : new THREE.MeshPhongMaterial({
            color: objectType.color,
            emissive: objectType.color,
            emissiveIntensity: 0.1,
          });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      sceneRef.current?.add(mesh);
      objectsRef.current.set(obj._id, mesh);

      // Add a subtle accretion disk for black holes for better visibility
      if (isBlackHole) {
        const diskGeom = new THREE.TorusGeometry(objectType.size * 1.6, objectType.size * 0.15, 12, 64);
        const diskMat = new THREE.MeshStandardMaterial({
          color: 0xffaa55,
          emissive: 0xff6600,
          emissiveIntensity: 0.35,
          metalness: 0.5,
          roughness: 0.4,
          transparent: true,
          opacity: 0.85,
        });
        const disk = new THREE.Mesh(diskGeom, diskMat);
        disk.rotation.x = Math.PI / 2;
        disk.position.copy(mesh.position);
        disk.castShadow = false;
        disk.receiveShadow = false;

        sceneRef.current?.add(disk);
        // Track the disk with the same key variant to remove on refresh; suffix to avoid overwrite
        objectsRef.current.set(`${obj._id}:disk`, disk);
      }
    });

    // Update grid curvature based on objects
    updateGridCurvature();
  }, [objects]);

  // Keep selected object in sync with realtime query updates
  useEffect(() => {
    if (!selectedObject) return;
    const updated = objects.find((o) => o._id === selectedObject._id);
    if (updated) setSelectedObject(updated);
  }, [objects, selectedObject?._id]);

  const updateGridCurvature = useCallback(() => {
    if (!gridRef.current || !basePositionsRef.current) return;

    const geometry = gridRef.current.geometry;
    const positions = geometry.attributes.position as THREE.BufferAttribute;

    // Use the selected object's latest mass optimistically for curvature calculations
    const effectiveObjects = selectedObject
      ? objects.map((o) => (o._id === selectedObject._id ? { ...o, mass: selectedObject.mass } : o))
      : objects;

    // Reset to base plane for X,Z reference (we don't directly set Y; we animate towards targets)
    const base = basePositionsRef.current;
    for (let i = 0; i < positions.count; i++) {
      positions.setX(i, base[i * 3 + 0]);
      positions.setZ(i, base[i * 3 + 2]);
    }

    // Physics-inspired curvature using weak-field potential without far-field clamping.
    const K = 0.4;     // curvature visualization scale
    const k_rs = 0.05; // visual "Schwarzschild radius" scale

    // First pass: compute displacements and accumulate mean to zero-center the sheet
    const disps = new Float32Array(positions.count);
    let sumDisp = 0;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);

      let disp = 0;

      for (const obj of effectiveObjects) {
        const dx = x - obj.position.x;
        const dz = z - obj.position.z;
        const r = Math.hypot(dx, dz);

        const mass = Math.max(0.000001, obj.mass);
        const r_s = k_rs * mass; // avoid singularities
        const effectiveR = Math.max(r, r_s);

        disp += mass * (1 / effectiveR);
      }

      disps[i] = disp;
      sumDisp += disp;
    }

    const meanDisp = sumDisp / Math.max(1, positions.count);

    // Create/ensure color attribute exists
    if (!geometry.getAttribute("color")) {
      const colors = new Float32Array(positions.count * 3);
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    }
    const colors = geometry.getAttribute("color") as THREE.BufferAttribute;
    const color = new THREE.Color();

    // Compute curvature magnitude range for heatmap normalization
    let maxAbs = 0;
    for (let i = 0; i < positions.count; i++) {
      const centered = disps[i] - meanDisp;
      if (Math.abs(centered) > maxAbs) maxAbs = Math.abs(centered);
    }
    const invMax = maxAbs > 1e-6 ? 1 / maxAbs : 0;

    // Prepare/resize targets if needed
    if (!targetYRef.current || targetYRef.current.length !== positions.count) {
      targetYRef.current = new Float32Array(positions.count);
    }
    if (!targetColorsRef.current || targetColorsRef.current.length !== positions.count * 3) {
      targetColorsRef.current = new Float32Array(positions.count * 3);
    }
    const targetY = targetYRef.current;
    const targetColors = targetColorsRef.current;

    // Set target values (the animate loop will smoothly lerp to these)
    for (let i = 0; i < positions.count; i++) {
      const baseY = base[i * 3 + 1];
      const centered = disps[i] - meanDisp;
      const newY = baseY - K * centered;
      targetY[i] = newY;

      // Heatmap: map |curvature| to 0..1, then to a perceptual ramp (blue->cyan->yellow->red)
      const t = Math.min(Math.max(Math.abs(centered) * invMax, 0), 1);
      const hue = (220 - 210 * t) / 360;
      const sat = 0.85;
      const lum = 0.55 - 0.1 * t;
      color.setHSL(hue, sat, lum);
      targetColors[i * 3 + 0] = color.r;
      targetColors[i * 3 + 1] = color.g;
      targetColors[i * 3 + 2] = color.b;
    }

    // Ensure a first small nudge if geometry has no colors (so visuals show immediately)
    colors.needsUpdate = true;
    positions.needsUpdate = true;
    geometry.computeBoundingSphere();
  }, [objects, selectedObject?._id, selectedObject?.mass]);

  // Debounce timer for mass updates
  const massUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCanvasClick = useCallback(async (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !cameraRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    // Create invisible plane at y=0 for object placement
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectPoint);

    if (intersectPoint) {
      try {
        const objectType = OBJECT_TYPES[selectedObjectType];
        await createObject({
          type: selectedObjectType,
          mass: objectType.mass,
          position: {
            x: intersectPoint.x,
            y: 0,
            z: intersectPoint.z,
          },
          name: `${selectedObjectType} ${objects.length + 1}`,
        });
        toast.success(`${selectedObjectType} placed successfully`);
      } catch (error) {
        toast.error("Failed to place object");
      }
    }
  }, [selectedObjectType, createObject, objects.length]);

  const handleMassInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedObject) return;

      const raw = e.target.value;
      let nextVal = parseFloat(raw);
      if (Number.isNaN(nextVal)) return;

      // Clamp allowed range
      nextVal = Math.min(50000, Math.max(0.1, nextVal));

      // Optimistically update selection for instant feedback
      const next = { ...selectedObject, mass: nextVal };
      setSelectedObject(next);

      // Recompute curvature immediately using the optimistic mass
      updateGridCurvature();

      // Debounce server mutation
      if (massUpdateTimerRef.current) clearTimeout(massUpdateTimerRef.current);
      massUpdateTimerRef.current = setTimeout(async () => {
        try {
          await updateObjectMass({
            objectId: selectedObject._id,
            mass: nextVal,
          });
        } catch (error) {
          toast.error("Failed to update mass");
        }
      }, 120);
    },
    [selectedObject, updateObjectMass, updateGridCurvature],
  );

  const handleClearAll = useCallback(async () => {
    try {
      await clearAllObjects();
      setSelectedObject(null);
      toast.success("All objects cleared");
    } catch (error) {
      toast.error("Failed to clear objects");
    }
  }, [clearAllObjects]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Please sign in to use the visualizer</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Control Panel */}
      <motion.div
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        className="w-80 bg-card border-r border-border p-8 overflow-y-auto"
      >
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight mb-4">Spacetime Visualizer</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Click on the grid to place objects and observe how they warp spacetime.
            </p>
          </div>

          {/* Object Selection */}
          <div>
            <h3 className="font-medium mb-4">Place Objects</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(OBJECT_TYPES).map(([type, config]) => (
                <Button
                  key={type}
                  variant={selectedObjectType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedObjectType(type as keyof typeof OBJECT_TYPES)}
                  className="text-xs capitalize"
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {/* Object List */}
          <div>
            <h3 className="font-medium mb-4">Objects ({objects.length})</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {objects.map((obj) => (
                <Card
                  key={obj._id}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedObject?._id === obj._id ? "bg-accent" : ""
                  }`}
                  onClick={() => setSelectedObject(obj)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium capitalize">{obj.type}</p>
                      <p className="text-xs text-muted-foreground">
                        Mass: {obj.mass.toFixed(2)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteObject({ objectId: obj._id });
                        if (selectedObject?._id === obj._id) {
                          setSelectedObject(null);
                        }
                      }}
                    >
                      ×
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Mass Control */}
          {selectedObject && (
            <div>
              <h3 className="font-medium mb-4">Adjust Mass</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {selectedObject.name || selectedObject.type}
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={0.1}
                      max={50000}
                      value={Number.isFinite(selectedObject.mass) ? selectedObject.mass : ""}
                      onChange={handleMassInputChange}
                      className="w-full"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedObject.mass.toFixed(2)} solar masses
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Visualization Options */}
          <div>
            <h3 className="font-medium mb-4">Options</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm">Show Geodesics</label>
                <Switch
                  checked={showGeodesics}
                  onCheckedChange={setShowGeodesics}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Educational Info</label>
                <Switch
                  checked={showEducational}
                  onCheckedChange={setShowEducational}
                />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-2">
            <Button
              onClick={handleClearAll}
              variant="outline"
              size="sm"
              className="w-full"
              disabled={objects.length === 0}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Visualization Area */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full h-full cursor-crosshair"
        />
        
        {/* Educational Overlay */}
        {showEducational && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-8 right-8 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-6 max-w-sm"
          >
            <h3 className="font-medium mb-2 flex items-center">
              <Zap className="w-4 h-4 mr-2" />
              General Relativity
            </h3>
            <p className="text-sm text-muted-foreground">
              Einstein's theory shows that massive objects curve spacetime. This curvature is what we experience as gravity. 
              The more massive an object, the more it warps the fabric of space and time around it.
            </p>
          </motion.div>
        )}

        {/* Controls Hint */}
        <div className="absolute bottom-8 left-8 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Controls:</strong> Left-drag rotate • Right-drag rotate • Shift+drag pan • Scroll to zoom
          </p>
        </div>
      </div>
    </div>
  );
}