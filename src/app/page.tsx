import HearoApp from "@/components/HearoApp";

// The landing page is the app itself behind a one-button cover: pressing it
// expands the button to full screen and starts listening in the same click.
export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Hearo",
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "WebBrowser",
            "offers": {
              "@type": "Offer",
              "price": "0.00",
              "priceCurrency": "USD"
            },
            "description": "Real-time AI transcription and translation. Perfect global sync for meetings with zero lag."
          })
        }}
      />
      <HearoApp intro />
    </>
  );
}
