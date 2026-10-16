/**
 * Imports the SVG file as a React component.
 * @requires [@rsbuild/plugin-svgr](https://npmjs.com/package/@rsbuild/plugin-svgr)
 */
declare module '*.svg?react' {
  import type React from 'react';
  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}

/** Stamped at build time by rsbuild.config.ts; read through lib/buildInfo.ts. */
declare const __BUILD_SHA__: string;
declare const __BUILD_DATE__: string;
