import { requireChatGPTUser } from './chatgpt-auth';
import Shongjog from './shongjog';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const user = await requireChatGPTUser('/');
  return <Shongjog tenant={user.userId} />;
}
