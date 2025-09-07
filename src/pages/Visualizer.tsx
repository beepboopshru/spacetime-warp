import SpacetimeVisualizer from "@/components/SpacetimeVisualizer";
import { useAuth } from "@/hooks/use-auth";
import { Navigate } from "react-router";

export default function VisualizerPage() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <SpacetimeVisualizer />;
}
