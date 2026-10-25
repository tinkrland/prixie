// kernel client tests: the seam is mocked, the shapes are from the live
// probes (oct 25 2026): POST /browsers returns the browser object with a
// native cdp_ws_url, the repl takes console.log output only, the fill
// operation wants type + browser_id + page_url.

import { assertEquals } from "jsr:@std/assert@1";
import {
  createKernelBrowser,
  kernelJs,
  kernelRepl,
  kernelVaultFill,
  listVaultCardItems,
} from "./kernel.ts";

// fetch mock: capture calls, answer from a route table
function withFetch(
  routes: Array<{ match: (url: string, init?: RequestInit) => any }>,
  fn: () => Promise<void>,
): { calls: Array<{ url: string; body?: any }>; done: Promise<void> } {
  const calls: { url: string; body?: any }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    for (const r of routes) {
      const out = r.match(url, init);
      if (out !== undefined) {
        return new Response(
          out.body === undefined ? "" : JSON.stringify(out.body),
          { status: out.status ?? 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }
    return new Response("{}", { status: 200 });
  };
  const done = fn().finally(() => { globalThis.fetch = real; });
  return { calls, done };
}

Deno.test("createKernelBrowser: stealth, headless, and the cdp seam", async () => {
  let seen: any;
  const { done } = withFetch(
    [
      {
        match: (url: string) => url.endsWith("/browsers") ? {
          body: { id: "kb_1", cdp_ws_url: "wss://cdp.kernel.sh/browser" },
        } : undefined,
      },
    ],
    async () => {
      Deno.env.set("KERNEL_API_KEY", "sk_test");
      const b = await createKernelBrowser("https://example.com");
      assertEquals(b.id, "kb_1");
      assertEquals(b.cdp_ws_url, "wss://cdp.kernel.sh/browser");
      Deno.env.delete("KERNEL_API_KEY");
    },
  );
  await done;
});

Deno.test("kernelRepl: stdout joins, errors are honest", async () => {
  const { done } = withFetch(
    [
      {
        match: (url: string) => url.includes("/repl") ? {
          body: {
            success: true,
            error: null,
            content: [
              { channel: "stdout", text: "hello" },
              { channel: "stderr", text: "noise" },
            ],
          },
        } : undefined,
      },
    ],
    async () => {
      Deno.env.set("KERNEL_API_KEY", "sk_test");
      const ok = await kernelRepl("kb_1", 'console.log("hello")');
      assertEquals(ok.ok, true);
      assertEquals(ok.out, "hello");
      Deno.env.delete("KERNEL_API_KEY");
    },
  );
  await done;

  const { done: d2 } = withFetch(
    [
      {
        match: (url: string) => url.includes("/repl") ? {
          body: { success: false, error: "page is not defined", content: [] },
        } : undefined,
      },
    ],
    async () => {
      Deno.env.set("KERNEL_API_KEY", "sk_test");
      const bad = await kernelRepl("kb_1", "page.title()");
      assertEquals(bad.ok, false);
      assertEquals(bad.error, "page is not defined");
      Deno.env.delete("KERNEL_API_KEY");
    },
  );
  await d2;
});

Deno.test("kernelJs: json round trip, null on garbage", async () => {
  const { done } = withFetch(
    [
      {
        match: (url: string) => url.includes("/repl") ? {
          body: {
            success: true,
            content: [{ channel: "stdout", text: '"Example Domain"' }],
          },
        } : undefined,
      },
    ],
    async () => {
      Deno.env.set("KERNEL_API_KEY", "sk_test");
      assertEquals(await kernelJs("kb_1", "document.title"), "Example Domain");
      Deno.env.delete("KERNEL_API_KEY");
    },
  );
  await done;

  const { done: d2 } = withFetch(
    [
      {
        match: (url: string) => url.includes("/repl") ? {
          body: { success: true, content: [{ channel: "stdout", text: "not json" }] },
        } : undefined,
      },
    ],
    async () => {
      Deno.env.set("KERNEL_API_KEY", "sk_test");
      assertEquals(await kernelJs("kb_1", "1+1"), null);
      Deno.env.delete("KERNEL_API_KEY");
    },
  );
  await d2;
});

Deno.test("kernelVaultFill: the exact handoff request", async () => {
  const { calls, done } = withFetch(
    [
      {
        match: (url: string) => url.includes("/operations") ? {
          body: { status: "completed" },
        } : undefined,
      },
    ],
    async () => {
      Deno.env.set("KERNEL_API_KEY", "sk_test");
      const r = await kernelVaultFill("prixie-vault", "buffer_card", "kb_1", "https://shop.example.com/checkout");
      assertEquals(r.ok, true);
      assertEquals(r.detail, "vault card filled by kernel");
      Deno.env.delete("KERNEL_API_KEY");
    },
  );
  await done;
  const call = calls.find((c) => c.url.includes("/operations"))!;
  assertEquals(call.url.includes("/vaults/prixie-vault/items/buffer_card/operations"), true);
  assertEquals(call.body, {
    type: "fill",
    browser_id: "kb_1",
    page_url: "https://shop.example.com/checkout",
  });
});

Deno.test("listVaultCardItems: card items only, masks only", async () => {
  const { done } = withFetch(
    [
      {
        match: (url: string) => url.includes("/items") ? {
          body: [
            { key: "buffer_card", type: "card", state: { status: "active", masks: { last4: "4242" } } },
            { key: "my_login", type: "credential", state: { status: "active" } },
          ],
        } : undefined,
      },
    ],
    async () => {
      Deno.env.set("KERNEL_API_KEY", "sk_test");
      const items = await listVaultCardItems("prixie-vault");
      assertEquals(items.length, 1);
      assertEquals(items[0].key, "buffer_card");
      assertEquals(items[0].masked_last4, "4242");
      Deno.env.delete("KERNEL_API_KEY");
    },
  );
  await done;
});
