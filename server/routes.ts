import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Hello World API Endpoint
  app.get(api.hello.path, (req, res) => {
    res.json({ message: "Hello from Vibe Coders United API!" });
  });

  // Users API
  app.get(api.users.list.path, async (req, res) => {
    // For now, just return empty list or implement full list if needed
    // Using a simple query for demonstration if storage supports it, 
    // but interface only has getUser/getUserByUsername. 
    // We'll just return empty for safety or mock it.
    res.json([]); 
  });

  app.post(api.users.create.path, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const user = await storage.createUser(input);
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  return httpServer;
}
