import { z } from "zod";

export const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.date(),
});
