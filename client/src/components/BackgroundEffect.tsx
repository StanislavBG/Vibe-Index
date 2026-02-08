import { motion } from "framer-motion";

export function BackgroundEffect() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-primary/5 to-transparent opacity-50 blur-3xl" />
      
      {/* Floating orbs */}
      <motion.div 
        animate={{ 
          x: [0, 100, 0],
          y: [0, -50, 0],
          scale: [1, 1.2, 1]
        }}
        transition={{ 
          duration: 20, 
          repeat: Infinity,
          ease: "easeInOut" 
        }}
        className="absolute top-20 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-[100px]" 
      />
      
      <motion.div 
        animate={{ 
          x: [0, -70, 0],
          y: [0, 100, 0],
          scale: [1, 1.3, 1]
        }}
        transition={{ 
          duration: 25, 
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2
        }}
        className="absolute bottom-20 -right-20 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[120px]" 
      />
    </div>
  );
}
