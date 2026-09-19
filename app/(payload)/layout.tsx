/* THIS FILE IS THE PAYLOAD ADMIN SHELL. It is a second root layout, which is
 * why the storefront now lives under app/(frontend). Route groups cannot
 * escape a root layout, so the admin can only get its own <html> if there is
 * no app/layout.tsx. Do not reintroduce one. */
import type { ServerFunctionClient } from "payload";

import config from "@payload-config";
import { RootLayout, handleServerFunctions } from "@payloadcms/next/layouts";
import "@payloadcms/next/css";
import React from "react";

import { importMap } from "./admin/importMap.js";

const serverFunction: ServerFunctionClient = async function (args) {
  "use server";
  return handleServerFunctions({ ...args, config, importMap });
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={serverFunction}
    >
      {children}
    </RootLayout>
  );
}
