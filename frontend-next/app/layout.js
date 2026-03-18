import "./globals.css";

export const metadata = {
  title: "EZP Parking",
  description: "Assumption University • Live system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

