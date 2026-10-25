import {adminRequest} from '@/domains/school-admin/http';
import {AdminError} from '@/domains/school-admin/service';
import {verifiedRecipient,recipientConfiguration} from '@/domains/school-admin/recipient';
import {claimFamilyInvitation} from '@/domains/family/invitations';
import {getDatabasePool} from '@/platform/db/pool';
import {readFamilyBody} from '@/domains/family/http';
export async function POST(request:Request){return adminRequest(request,async s=>{const external=request.headers.get('x-psg-identity-token');if(!external||external.length>16384)throw new AdminError('VERIFIED_RECIPIENT_REQUIRED',401);const pool=getDatabasePool();const email=await verifiedRecipient(pool,s.personId,external,recipientConfiguration());return claimFamilyInvitation(pool,s.personId,email,await readFamilyBody(request));});}
