import 'react';

declare module 'react' {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    /** پشتیبانی از ویژگی inert (React 18) */
    inert?: boolean | '' | undefined;
  }
}
