/// <reference types="@cloudflare/workers-types" />

declare module "*.html" {
  const content: string;
  export default content;
}
