// The shared content code imports types from game modules, whose own imports reach .vue files and
// import.meta.env; the tool's bundle leaves those out, but its type check still walks them.
/// <reference types="vite/client" />
declare module '*.vue' {
  const component: any;
  export default component;
}
