import { z } from 'zod';

export const DevelopmentSpecificationSchema = z
  .object({
    title: z.string().min(1),
    problem: z.string().min(1),
    scope: z.array(z.string().min(1)).min(1),
    nonGoals: z.array(z.string().min(1)),
    acceptanceCriteria: z.array(z.string().min(1)).min(1),
    constraints: z.array(z.string().min(1)),
  })
  .strict();
