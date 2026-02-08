import { SignIn, SignUp } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { BackgroundEffect } from "@/components/BackgroundEffect";

export function SignInPage() {
  return (
    <div className="min-h-screen w-full relative">
      <BackgroundEffect />
      <Navbar />
      <div className="pt-24 pb-16 px-4 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md flex justify-center"
        >
          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/register"
            fallbackRedirectUrl="/"
            data-testid="clerk-sign-in"
          />
        </motion.div>
      </div>
    </div>
  );
}

export function SignUpPage() {
  return (
    <div className="min-h-screen w-full relative">
      <BackgroundEffect />
      <Navbar />
      <div className="pt-24 pb-16 px-4 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md flex justify-center"
        >
          <SignUp
            routing="path"
            path="/register"
            signInUrl="/login"
            fallbackRedirectUrl="/"
            data-testid="clerk-sign-up"
          />
        </motion.div>
      </div>
    </div>
  );
}
