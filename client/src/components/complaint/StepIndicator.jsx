/**
 * components/complaint/StepIndicator.jsx
 *
 * Visual breadcrumb showing the 4 wizard steps.
 * Props:
 *   currentStep  {number}  1–4 (the active step)
 */
const STEPS = [
  { id: 1, label: 'Image'       },
  { id: 2, label: 'Location'    },
  { id: 3, label: 'Description' },
  { id: 4, label: 'Review'      },
];

export default function StepIndicator({ currentStep }) {
  return (
    <div className="step-indicator" role="navigation" aria-label="Wizard steps">
      {STEPS.map((step) => {
        const isActive    = step.id === currentStep;
        const isCompleted = step.id <  currentStep;
        const className   = `step-node${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`;

        return (
          <div key={step.id} className={className}>
            <div className="step-bubble" aria-current={isActive ? 'step' : undefined}>
              {isCompleted ? '✓' : step.id}
            </div>
            <span className="step-label">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
