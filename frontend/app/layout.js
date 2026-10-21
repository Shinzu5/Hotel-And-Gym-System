import "./globals.css";
import { ToastViewport } from "@/components/Toasts";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata = {
  title: "Abbsey Admin",
  description: "Admin panel for the Fitness Gym and the Apartments.",
};

// Applies the saved (or system) theme before the first paint so a dark-theme
// reload never flashes white.
const themeScript = `(function(){try{var s=localStorage.getItem('abbsey-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    // The script above mutates <html>, so suppress the hydration warning.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        {/* Single toast viewport for the whole app (actions + socket notifications). */}
        <ToastViewport />
      </body>
    </html>
  );
}
