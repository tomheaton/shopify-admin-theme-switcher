import { describe, expect, it } from "vitest";
import { appHostPattern } from "../src/settings";

describe("appHostPattern", () => {
  it.each([
    ["my-app.example.com", "https://my-app.example.com/*"],
    ["  my-app.example.com  ", "https://my-app.example.com/*"],
    ["https://my-app.example.com/app?shop=example", "https://my-app.example.com/*"],
    ["https://my-app.example.com:8443/", "https://my-app.example.com/*"],
    ["My-App.Example.com", "https://my-app.example.com/*"],
  ])("turns %j into %j", (input, pattern) => {
    expect(appHostPattern(input)).toBe(pattern);
  });

  it.each([
    ["nothing", ""],
    ["an HTTP URL", "http://my-app.example.com/"],
    ["the admin itself", "https://admin.shopify.com/store/example"],
    ["something that is not a host", "not a host"],
  ])("rejects %s", (_case, input) => {
    expect(appHostPattern(input)).toBeNull();
  });
});
