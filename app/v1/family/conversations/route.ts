import {familyBillingRequest} from '@/domains/family-billing/http';import {familyConversationDirectory} from '@/domains/school-conversations/authority';import {getDatabasePool} from '@/platform/db/pool';
export async function GET(request:Request){return familyBillingRequest(request,person=>familyConversationDirectory(getDatabasePool(),person));}
