import {z} from 'zod';
export const billingActions=['family.finance.read','family.finance.plan.accept','family.finance.proof.submit','family.finance.activity.accept'] as const;
export const billingAction=z.enum(billingActions);
export const billingGrantInput=z.object({relationshipId:z.string().uuid(),actions:z.array(billingAction).min(1).max(4),expiresAt:z.string().datetime(),billingAuthorityChecked:z.literal(true)}).strict().refine(v=>v.actions.includes('family.finance.read')&&new Set(v.actions).size===v.actions.length,'Read access is required and actions must be unique');
export const billingDecisionInput=z.object({action:billingAction}).strict();
export const billingRevokeInput=z.object({acknowledgement:z.literal(true)}).strict();
export const billingContractVersion='family-billing-v1' as const;
