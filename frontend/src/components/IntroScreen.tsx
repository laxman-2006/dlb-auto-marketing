import React, { useEffect, useState } from 'react';

interface IntroScreenProps {
  onComplete: () => void;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({ onComplete }) => {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    // Check user preference for reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 600 : 2200;

    const timer = setTimeout(() => {
      setFadingOut(true);
      setTimeout(onComplete, 400); // Allow fade-out animation to complete
    }, duration);

    return () => clearTimeout(timer);
  }, [onComplete]);

  const handleSkip = () => {
    setFadingOut(true);
    setTimeout(onComplete, 200);
  };

  return (
    <div
      className={`dlb-intro-screen ${fadingOut ? 'dlb-intro-fade-out' : ''}`}
      onClick={handleSkip}
      title="Click anywhere to skip intro"
    >
      {/* Ambient background lighting */}
      <div className="dlb-intro-ambient" />

      {/* Center Branded Container */}
      <div className="dlb-intro-content">
        {/* Animated Ring Wrapper */}
        <div className="dlb-intro-logo-wrapper">
          {/* Outer slow-rotating gold accent ring */}
          <div className="dlb-intro-ring-outer" />

          {/* Inner luminous blue-and-gold rotating ring */}
          <div className="dlb-intro-ring-inner" />

          {/* Static, sharp official DLB logo */}
          <div className="dlb-intro-logo-core">
            <img
              src="/logo.jpg"
              alt="DLB AUTO MARKETING Logo"
              className="dlb-intro-logo-img"
            />
          </div>
        </div>

        {/* Brand Reveal Typography */}
        <div className="dlb-intro-text-block">
          <h1 className="dlb-intro-title">
            DLB <span className="dlb-intro-title-gold">AUTO MARKETING</span>
          </h1>
          <p className="dlb-intro-subtitle">SMART MARKETING. SIMPLIFIED.</p>
        </div>

        {/* Minimal Indeterminate Progress Line */}
        <div className="dlb-intro-loader-track">
          <div className="dlb-intro-loader-bar" />
        </div>

        <button className="dlb-intro-skip-btn" onClick={handleSkip}>
          Skip Intro →
        </button>
      </div>
    </div>
  );
};
