const { themes: prismThemes } = require("prism-react-renderer");

const owner = process.env.GITHUB_REPOSITORY_OWNER ?? "Genentech";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "Move37";
const isUserPage = repoName.toLowerCase() === `${owner}.github.io`.toLowerCase();
const url = process.env.DOCS_SITE_URL ?? `https://${owner.toLowerCase()}.github.io`;
const baseUrl =
  process.env.DOCS_BASE_URL ??
  (process.env.GITHUB_ACTIONS === "true" && !isUserPage ? `/${repoName}/` : "/");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Move37 Contributors",
  tagline: "Repository setup, architecture, and delivery workflows for new contributors.",
  favicon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='18' fill='%230d3b66'/%3E%3Ctext x='50' y='60' font-size='52' text-anchor='middle' fill='%23faf0ca' font-family='Arial'%3EM%3C/text%3E%3C/svg%3E",
  url,
  baseUrl,
  organizationName: "Genentech",
  projectName: "Move37",
  trailingSlash: false,
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: require.resolve("./sidebars.js"),
        },
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: "Move37 Contributors",
      items: [
        {
          type: "docSidebar",
          sidebarId: "contributorsSidebar",
          position: "left",
          label: "Docs",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs Tracks",
          items: [
            {
              label: "Contributor Docs",
              to: "/",
            },
            {
              label: "Fern Workspace",
              href: "https://github.com/Genentech/Move37/tree/main/fern",
            },
          ],
        },
        {
          title: "Repository",
          items: [
            {
              label: "Move37",
              href: "https://github.com/Genentech/Move37",
            },
          ],
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "python", "json", "yaml"],
    },
  },
};

module.exports = config;
