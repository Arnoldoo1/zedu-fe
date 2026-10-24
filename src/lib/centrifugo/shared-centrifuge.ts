import axios from "axios";
import {
  Centrifuge,
  type Subscription,
  type SubscriptionOptions,
} from "centrifuge";

const connectUrl = process.env.NEXT_PUBLIC_CONNECT_URL as string;

let sharedClient: Centrifuge | null = null;
const subscriptionRefCounts = new Map<string, number>();

export async function getConnectionToken(): Promise<string> {
  const token = localStorage.getItem("token") || "";
  const response = await axios.get(
    `${process.env.NEXT_PUBLIC_BASE_URL}/token/connection`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.data.token;
}

export async function getSubscriptionToken(channel: string): Promise<string> {
  const token = localStorage.getItem("token") || "";

  const response = await axios.post(
    `${process.env.NEXT_PUBLIC_BASE_URL}/token/subscription`,
    { channel },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.data.token;
}

export function getSharedCentrifuge(): Centrifuge {
  if (!sharedClient) {
    sharedClient = new Centrifuge(connectUrl, {
      getToken: getConnectionToken,
      debug: process.env.NODE_ENV !== "production",
      minReconnectDelay: 1_500,
      maxReconnectDelay: 30_000,
    });
    sharedClient.connect();
  }

  return sharedClient;
}

export function prepareChannelSubscription(
  client: Centrifuge,
  channel: string,
  options: SubscriptionOptions
): Subscription {
  const existingSubscription = client.getSubscription(channel);
  if (existingSubscription) {
    subscriptionRefCounts.set(
      channel,
      (subscriptionRefCounts.get(channel) ?? 0) + 1
    );
    return existingSubscription;
  }

  // A refused channel used to be retried in a tight loop. Back off so a bad
  // room id costs one request every few seconds, not hundreds a second.
  const sub = client.newSubscription(channel, {
    minResubscribeDelay: 2_000,
    maxResubscribeDelay: 60_000,
    ...options,
  });
  subscriptionRefCounts.set(channel, 1);
  return sub;
}

export function releaseChannelSubscription(
  client: Centrifuge,
  channel: string,
  sub: Subscription
): void {
  const nextCount = (subscriptionRefCounts.get(channel) ?? 1) - 1;

  if (nextCount <= 0) {
    subscriptionRefCounts.delete(channel);
    sub.unsubscribe();
    client.removeSubscription(sub);
    return;
  }

  subscriptionRefCounts.set(channel, nextCount);
}

export function resetSharedCentrifuge(): void {
  if (!sharedClient) return;

  sharedClient.disconnect();
  sharedClient = null;
  subscriptionRefCounts.clear();
}
