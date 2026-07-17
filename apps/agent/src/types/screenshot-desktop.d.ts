declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: 'jpg' | 'png';
    screen?: number | string;
    filename?: string;
  }
  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  namespace screenshot {
    function listDisplays(): Promise<Array<{ id: number | string; name: string }>>;
  }
  export = screenshot;
}
