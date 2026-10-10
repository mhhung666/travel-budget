import { createContext, useContext, type PropsWithChildren, type ReactNode } from 'react';

const Chrome = createContext<ReactNode>(null);
/** Navigation belongs inside the existing scroller, including virtualized list headers. */
export function ScrollChromeProvider({
  header,
  children,
}: PropsWithChildren<{ header: ReactNode }>) {
  const parent = useContext(Chrome);
  return (
    <Chrome.Provider
      value={
        <>
          {parent}
          {header}
        </>
      }
    >
      {children}
    </Chrome.Provider>
  );
}
export function ScrollChrome() {
  return useContext(Chrome);
}
