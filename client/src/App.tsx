import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Submit from "@/pages/Submit";
import ProjectDetail from "@/pages/ProjectDetail";
import Dashboard from "@/pages/Dashboard";
import { SignInPage, SignUpPage } from "@/pages/Auth";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/submit" component={Submit} />
      <Route path="/project/:id" component={ProjectDetail} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/login" component={SignInPage} />
      <Route path="/register" component={SignUpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
