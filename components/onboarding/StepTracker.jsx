'use client';

import { IconCheck } from '@/components/icons/Icons';

export function StepTracker({ currentStep, steps }) {
  return (
    <div className="w-full max-w-md mx-auto mb-8 px-2">
      <div className="flex items-center justify-between relative">
        {/* Connecting progress bar */}
        <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200 -z-0">
          <div
            className="h-full bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] transition-all duration-500 ease-out"
            style={{
              width: `${((Math.min(currentStep, steps.length) - 1) / (steps.length - 1)) * 100}%`,
            }}
          />
        </div>

        {steps.map((step, idx) => {
          const stepNumber = idx + 1;
          const isCompleted = currentStep > stepNumber;
          const isCurrent = currentStep === stepNumber;

          return (
            <div key={step.id} className="flex flex-col items-center z-10">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  isCompleted
                    ? 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white shadow-md shadow-[#1f6fb2]/25'
                    : isCurrent
                    ? 'bg-white text-[#1f6fb2] border-2 border-[#1f6fb2] ring-4 ring-[#2ec4b6]/20 shadow-sm'
                    : 'bg-white text-slate-400 border-2 border-slate-200'
                }`}
              >
                {isCompleted ? <IconCheck className="w-4 h-4 stroke-[3]" /> : stepNumber}
              </div>
              <span
                className={`text-[11px] font-medium mt-2 transition-colors duration-200 ${
                  isCurrent ? 'text-[#1f6fb2] font-semibold' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
