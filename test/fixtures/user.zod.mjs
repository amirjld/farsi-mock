import { z } from "zod";
export const User = z.object({ id: z.uuid(), codeMelli: z.string(), mobile: z.string(), email: z.email(), age: z.int().min(20).max(30) });
export default User;
