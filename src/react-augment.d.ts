import 'react';

declare module 'react' {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    /** پشتیبانی از ویژگی inert (React 18) */
    inert?: boolean | '' | undefined;
  }
  interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
    /** اولویت دانلود تصویر (React 18 آن را بدون تغییر به DOM می‌دهد) */
    fetchpriority?: 'high' | 'low' | 'auto';
  }
}
