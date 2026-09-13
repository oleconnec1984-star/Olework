import {notFound} from 'next/navigation';
import AvatarLab from './studio-lab';
export default async function Page({searchParams}:{searchParams:Promise<{compact?:string}>}){if(process.env.NODE_ENV==='production')notFound();const params=await searchParams;return <AvatarLab compact={params.compact==='1'}/>}
