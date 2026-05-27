/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, Wifi, Battery, Signal, Zap } from 'lucide-react';

interface PhoneFrameProps {
  children: React.ReactNode;
  title: string;
}

export default function PhoneFrame({ children, title }: PhoneFrameProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [deviceTime, setDeviceTime] = useState("");
  const [batteryLevel, setBatteryLevel] = useState(98);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setDeviceTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  // Soft battery decay simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setBatteryLevel((prev) => (prev > 5 ? prev - 1 : 100));
    }, 180000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-start p-4 md:p-8 select-none font-sans">
      {/* Control panel for framing modes */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            {/* Liquid / Flux Dynamic SVG Logo */}
            <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 100 100" className="w-8 h-8 animate-[spin_8s_linear_infinite] drop-shadow-[0_2px_6px_rgba(79,70,229,0.3)]">
                <defs>
                  <linearGradient id="flux-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="50%" stopColor="#ec4899" />
                    <stop offset="100%" stopColor="#2563eb" />
                  </linearGradient>
                </defs>
                {/* Fluid continuous overlapping path representing constant flux */}
                <path 
                  d="M 50,15 C 75,10 90,30 85,50 C 80,70 70,85 50,85 C 30,85 10,70 15,50 C 20,30 25,20 50,15 Z" 
                  fill="none" 
                  stroke="url(#flux-grad-1)" 
                  strokeWidth="8.5" 
                  strokeLinecap="round"
                />
                <circle cx="50" cy="50" r="14" fill="url(#flux-grad-1)" className="opacity-80 scale-90 origin-center" />
              </svg>
              {/* Floating micro accent to illustrate flux friction */}
              <div className="absolute w-2 h-2 bg-white rounded-full animate-ping opacity-75" />
            </div>
            <span className="uppercase tracking-tight font-extrabold text-slate-900">FluxList AI</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Dynamic task alignment and calendar automation in constant flux</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded border border-slate-200">
          <button
            onClick={() => setIsFullscreen(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-sm transition-all cursor-pointer ${
              !isFullscreen
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Android Shell
          </button>
          <button
            onClick={() => setIsFullscreen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-sm transition-all cursor-pointer ${
              isFullscreen
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            Native Web Canvas
          </button>
        </div>
      </div>

      {/* Frame Container */}
      {isFullscreen ? (
        <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col h-[820px]">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-widest">Full Screen Workspace</span>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-4">
              <span className="flex items-center gap-1"><Wifi className="h-3.5 w-3.5 text-indigo-600" /> Connected</span>
              <span className="flex items-center gap-1"><Battery className="h-3.5 w-3.5 text-indigo-600" /> {batteryLevel}%</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-white text-slate-900">
            {children}
          </div>
        </div>
      ) : (
        /* Gorgeous simulated Android phone frame with crisp physical edges & white viewport */
        <div className="relative mx-auto border-[12px] border-slate-900 bg-slate-900 rounded-[56px] shadow-2xl overflow-hidden w-[380px] max-w-full h-[812px] flex flex-col ring-8 ring-slate-200/40">
          {/* Status Bar / Notch area */}
          <div className="absolute top-0 inset-x-0 h-8 bg-white/90 backdrop-blur-sm z-50 px-6 flex items-center justify-between pointer-events-none text-slate-700">
            {/* Clock */}
            <span className="text-xs font-bold tracking-tight">{deviceTime || "09:41"}</span>
            
            {/* Notch */}
            <div className="w-24 h-4 bg-slate-900 rounded-b-xl absolute left-1/2 transform -translate-x-1/2 top-0 flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-slate-800 border border-slate-700"></span>
            </div>

            {/* Right Status (Wifi, Signal, Battery) */}
            <div className="flex items-center gap-1.5">
              <Signal className="h-3.5 w-3.5" />
              <Wifi className="h-3.5 w-3.5" />
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold">{batteryLevel}%</span>
                <span className="relative inline-flex h-3 w-5 border border-slate-400 rounded-sm p-[1px] items-center">
                  <span className="bg-indigo-600 h-full rounded-2xs" style={{ width: `${batteryLevel}%` }}></span>
                </span>
              </div>
            </div>
          </div>

          {/* Core Android Application Container */}
          <div className="flex-1 pt-8 overflow-y-auto bg-white flex flex-col relative text-slate-900">
            {children}
          </div>

          {/* Android Home indicator bar at bottom */}
          <div className="absolute bottom-1 inset-x-0 h-4 bg-transparent z-50 flex items-end justify-center pb-1 pointer-events-none">
            <div className="w-28 h-1 bg-slate-300 rounded-full"></div>
          </div>
        </div>
      )}
    </div>
  );
}
