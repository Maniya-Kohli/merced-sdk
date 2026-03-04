import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export async function sign_request(
  privateKey: Hex,
  method: string,
  path: string,
): Promise<{ wallet: string; signature: string; timestamp: string }> {
  const account = privateKeyToAccount(privateKey);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `auth:${method.toUpperCase()}:${path}:${timestamp}`;
  const signature = await account.signMessage({ message });

  return {
    wallet: account.address,
    signature,
    timestamp,
  };
}
