export async function readRegistrationBody(request:Request):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)return null;const chunks:Uint8Array[]=[];let total=0;
 try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>8192){await reader.cancel();return null;}chunks.push(part.value);}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder().decode(bytes));}catch{return null;}finally{reader.releaseLock();}
}
