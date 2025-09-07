import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
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
  const gridRef = useRef<THREE.Group | null>(null);
  const objectsRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [selectedObjectType, setSelectedObjectType] = useState<keyof typeof OBJECT_TYPES>("planet");
  const [showGeodesics, setShowGeodesics] = useState(false);
  const [showEducational, setShowEducational] = useState(false);
  const [selectedObject, setSelectedObject] = useState<SpaceObject | null>(null);

  const objects = useQuery(api.objects.getUserObjects) || [];
  const createObject = useMutation(api.objects.createObject);
  const updateObjectMass = useMutation(api.objects.updateObjectMass);
  const deleteObject = useMutation(api.objects.deleteObject);
  const clearAllObjects = useMutation(api.objects.clearAllObjects);

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(window.innerWidth * 0.7, window.innerHeight * 0.8);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Create spacetime grid
    const gridGroup = new THREE.Group();
    const gridSize = 20;
    const gridDivisions = 40;
    
    // Create grid lines
    for (let i = -gridSize; i <= gridSize; i += gridSize / (gridDivisions / 2)) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-gridSize, 0, i),
        new THREE.Vector3(gridSize, 0, i)
      ]);
      const material = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3 });
      const line = new THREE.Line(geometry, material);
      gridGroup.add(line);

      const geometry2 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i, 0, -gridSize),
        new THREE.Vector3(i, 0, gridSize)
      ]);
      const line2 = new THREE.Line(geometry2, material);
      gridGroup.add(line2);
    }

    gridRef.current = gridGroup;
    scene.add(gridGroup);

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

    const handleMouseDown = (event: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: event.clientX, y: event.clientY };
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;

      const deltaMove = {
        x: event.clientX - previousMousePosition.x,
        y: event.clientY - previousMousePosition.y
      };

      const rotationSpeed = 0.005;
      camera.position.x = camera.position.x * Math.cos(deltaMove.x * rotationSpeed) - camera.position.z * Math.sin(deltaMove.x * rotationSpeed);
      camera.position.z = camera.position.x * Math.sin(deltaMove.x * rotationSpeed) + camera.position.z * Math.cos(deltaMove.x * rotationSpeed);
      
      camera.lookAt(0, 0, 0);
      previousMousePosition = { x: event.clientX, y: event.clientY };
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleWheel = (event: WheelEvent) => {
      const zoomSpeed = 0.1;
      const distance = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
      const newDistance = distance + (event.deltaY > 0 ? zoomSpeed : -zoomSpeed);
      
      if (newDistance > 2 && newDistance < 50) {
        camera.position.multiplyScalar(newDistance / distance);
      }
    };

    canvasRef.current.addEventListener('mousedown', handleMouseDown);
    canvasRef.current.addEventListener('mousemove', handleMouseMove);
    canvasRef.current.addEventListener('mouseup', handleMouseUp);
    canvasRef.current.addEventListener('wheel', handleWheel);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('mousedown', handleMouseDown);
        canvasRef.current.removeEventListener('mousemove', handleMouseMove);
        canvasRef.current.removeEventListener('mouseup', handleMouseUp);
        canvasRef.current.removeEventListener('wheel', handleWheel);
      }
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
      const material = new THREE.MeshPhongMaterial({ 
        color: objectType.color,
        emissive: obj.type === 'blackhole' ? 0x000000 : objectType.color,
        emissiveIntensity: obj.type === 'blackhole' ? 0 : 0.1
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      sceneRef.current?.add(mesh);
      objectsRef.current.set(obj._id, mesh);
    });

    // Update grid curvature based on objects
    updateGridCurvature();
  }, [objects]);

  const updateGridCurvature = useCallback(() => {
    if (!gridRef.current) return;

    // Reset grid to flat
    gridRef.current.children.forEach((child) => {
      if (child instanceof THREE.Line) {
        const positions = child.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          positions.setY(i, 0);
        }
        positions.needsUpdate = true;
      }
    });

    // Apply curvature from each object
    objects.forEach((obj) => {
      const objectType = OBJECT_TYPES[obj.type as keyof typeof OBJECT_TYPES];
      if (!objectType) return;

      const massEffect = Math.log(obj.mass + 1) * 0.5;
      
      gridRef.current?.children.forEach((child) => {
        if (child instanceof THREE.Line) {
          const positions = child.geometry.attributes.position;
          
          for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);
            const distance = Math.sqrt(
              Math.pow(x - obj.position.x, 2) + Math.pow(z - obj.position.z, 2)
            );
            
            if (distance < 10) {
              const curvature = massEffect / (distance + 0.5);
              const currentY = positions.getY(i);
              positions.setY(i, currentY - curvature);
            }
          }
          positions.needsUpdate = true;
        }
      });
    });
  }, [objects]);

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

  const handleMassChange = useCallback(async (value: number[]) => {
    if (!selectedObject) return;
    
    try {
      await updateObjectMass({
        objectId: selectedObject._id,
        mass: value[0],
      });
    } catch (error) {
      toast.error("Failed to update mass");
    }
  }, [selectedObject, updateObjectMass]);

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
                  <Slider
                    value={[selectedObject.mass]}
                    onValueChange={handleMassChange}
                    min={0.1}
                    max={50000}
                    step={0.1}
                    className="w-full"
                  />
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
            <strong>Controls:</strong> Click to place objects • Drag to rotate • Scroll to zoom
          </p>
        </div>
      </div>
    </div>
  );
}