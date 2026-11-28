/** Input contract for umpire score events (one rally, or an undo of the last rally). */
import { z } from 'zod';

export const umpireEventSchema = z
  .object({
    id: z.string({ error: 'required' }).trim().min(1, 'required').max(64, 'tooLong'),
    kind: z.enum(['POINT', 'UNDO'], { error: 'invalid' }),
    side: z.enum(['A', 'B'], { error: 'invalid' }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'POINT' && !v.side)
      ctx.addIssue({ code: 'custom', path: ['side'], message: 'required' });
    if (v.kind === 'UNDO' && v.side)
      ctx.addIssue({ code: 'custom', path: ['side'], message: 'invalid' });
  });
export type UmpireEventInput = z.infer<typeof umpireEventSchema>;
