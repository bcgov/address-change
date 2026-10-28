import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightOpenAPI, { openAPISidebarGroups } from "starlight-openapi";

export default defineConfig({
  site: "https://bcgov.github.io",
  base: "/address-change",
  integrations: [
    starlight({
      title: "Address Change",
      logo: {
        src: "./src/assets/bc-mark.svg",
        alt: "BC Government Logo",
      },
      customCss: ["./src/styles/bc-gov.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/bcgov/address-change",
        },
      ],
      plugins: [
        starlightOpenAPI([
          {
            base: "api/test",
            schema: "public/openapi/test.json",
            sidebar: { label: "API Reference (Test)" },
          },
          {
            base: "api/prod",
            schema: "public/openapi/prod.json",
            sidebar: { label: "API Reference (Prod)" },
          },
        ]),
      ],
      sidebar: [
        { label: "Overview", slug: "index" },
        { label: "Environments", slug: "environments" },
        ...openAPISidebarGroups,
      ],
    }),
  ],
});
