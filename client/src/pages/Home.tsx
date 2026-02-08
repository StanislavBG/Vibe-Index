import { useHello } from "@/hooks/use-hello";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { motion } from "framer-motion";
import { ArrowRight, Code2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Home() {
  const { data, isLoading } = useHello();

  const handleGetStarted = () => {
    alert("Welcome to the Vibe Coders United experience!");
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 20
      }
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center p-4">
      <BackgroundEffect />
      
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-4xl w-full mx-auto text-center z-10 space-y-12"
      >
        {/* Header Section */}
        <motion.div variants={itemVariants} className="space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium text-sm mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            System Online v1.0
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9]">
            VIBE CODERS
            <br />
            <span className="text-gradient">UNITED</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground font-light max-w-2xl mx-auto leading-relaxed">
            Where <span className="font-semibold text-foreground">vibe</span> meets <span className="font-semibold text-foreground">code</span>. 
            Building the next generation of digital experiences with style.
          </p>
        </motion.div>

        {/* Feature Cards - Decorative */}
        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto"
        >
          <Card className="glass-card p-6 flex items-start gap-4 hover:-translate-y-1 transition-transform duration-300">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Zap className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-bold mb-1">High Velocity</h3>
              <p className="text-muted-foreground text-sm">Lightning fast development cycles with premium aesthetics.</p>
            </div>
          </Card>
          
          <Card className="glass-card p-6 flex items-start gap-4 hover:-translate-y-1 transition-transform duration-300">
            <div className="p-3 rounded-xl bg-accent/10 text-accent">
              <Code2 className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-bold mb-1">Clean Architecture</h3>
              <p className="text-muted-foreground text-sm">Scalable, type-safe foundations for robust applications.</p>
            </div>
          </Card>
        </motion.div>

        {/* Action Section */}
        <motion.div variants={itemVariants} className="pt-8">
          <Button 
            onClick={handleGetStarted}
            size="lg" 
            className="text-lg px-8 py-6 rounded-2xl bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 group"
          >
            Get Started
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
          
          <div className="mt-8 text-sm text-muted-foreground font-mono">
             {isLoading ? (
               <span className="animate-pulse">Connecting to server...</span>
             ) : (
               <span className="flex items-center justify-center gap-2">
                 Server Status: <span className="text-green-500">Connected</span> • {data?.message || "Ready"}
               </span>
             )}
          </div>
        </motion.div>
      </motion.div>

      {/* Footer */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-6 text-xs text-muted-foreground/50 font-mono"
      >
        © 2024 VIBE CODERS UNITED INC.
      </motion.div>
    </div>
  );
}
