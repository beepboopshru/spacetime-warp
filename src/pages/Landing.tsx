import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { ArrowRight, Atom, Orbit, Zap } from "lucide-react";
import { Link } from "react-router";

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="min-h-screen bg-background"
    >
      {/* Navigation */}
      <nav className="border-b border-border/20">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <Orbit className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold tracking-tight">Spacetime</span>
            </div>
            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <Button asChild>
                  <Link to="/visualizer">
                    Open Visualizer
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/auth">
                    Get Started
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-32">
        <div className="max-w-6xl mx-auto px-8 text-center">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <h1 className="text-6xl font-bold tracking-tight mb-8">
              Visualize How Mass
              <br />
              <span className="text-muted-foreground">Warps Spacetime</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              Interactive 3D simulation of Einstein's General Relativity. 
              Place massive objects and watch spacetime bend around them.
            </p>
            <div className="flex items-center justify-center space-x-6">
              <Button size="lg" asChild>
                <Link to={isAuthenticated ? "/visualizer" : "/auth"}>
                  {isAuthenticated ? "Open Visualizer" : "Start Exploring"}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 bg-muted/20">
        <div className="max-w-6xl mx-auto px-8">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-center mb-20"
          >
            <h2 className="text-4xl font-bold tracking-tight mb-6">
              Physics Made Visual
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Experience the fundamental concepts of spacetime curvature through interactive simulation.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-12">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Orbit className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-4">Interactive Objects</h3>
              <p className="text-muted-foreground leading-relaxed">
                Drag and drop planets, stars, black holes, and more. 
                Adjust their mass in real-time to see immediate effects.
              </p>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.8 }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Atom className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-4">Realistic Physics</h3>
              <p className="text-muted-foreground leading-relaxed">
                Based on Einstein's equations. Watch how different masses 
                create varying degrees of spacetime curvature.
              </p>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1.0, duration: 0.8 }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Zap className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-4">Educational Insights</h3>
              <p className="text-muted-foreground leading-relaxed">
                Learn about geodesics, event horizons, and the fundamental 
                principles of General Relativity theory.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32">
        <div className="max-w-4xl mx-auto px-8 text-center">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
          >
            <h2 className="text-4xl font-bold tracking-tight mb-8">
              Ready to Explore Spacetime?
            </h2>
            <p className="text-lg text-muted-foreground mb-12">
              Start your journey into the fascinating world of General Relativity.
            </p>
            <Button size="lg" asChild>
              <Link to={isAuthenticated ? "/visualizer" : "/auth"}>
                {isAuthenticated ? "Open Visualizer" : "Get Started"}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/20 py-12">
        <div className="max-w-6xl mx-auto px-8 text-center">
          <p className="text-muted-foreground">
            Built with Three.js and React • Inspired by Einstein's General Relativity
          </p>
        </div>
      </footer>
    </motion.div>
  );
}