/**
 * pages/ReportWizard.jsx
 *
 * Top-level wizard container.
 * - Reads/writes `step` from the complaint Redux slice.
 * - Renders the active step sub-component.
 * - Back navigation preserves all earlier state.
 */
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { setStep, resetComplaint } from '../slices/complaintSlice';

import StepIndicator   from '../components/complaint/StepIndicator';
import Step1_ImageCapture from '../components/complaint/Step1_ImageCapture';
import Step2_LocationPin  from '../components/complaint/Step2_LocationPin';
import Step3_Description  from '../components/complaint/Step3_Description';
import Step4_ReviewForm   from '../components/complaint/Step4_ReviewForm';

export default function ReportWizard() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const step      = useSelector((s) => s.complaint.step);

  /** Advance to next step */
  function goNext()           { dispatch(setStep(step + 1)); }
  /** Go back one step, or exit wizard on step 1 */
  function goBack() {
    if (step <= 1) {
      dispatch(resetComplaint());
      navigate('/citizen', { replace: true });
    } else {
      dispatch(setStep(step - 1));
    }
  }
  /** Jump directly to any step (for Edit links on Step 4) */
  function goToStep(n)        { dispatch(setStep(n)); }

  // Start at step 1 (step 0 is the landing dashboard, not part of the wizard card)
  const activeStep = step < 1 ? 1 : step;

  return (
    <div className="wizard-shell">
      {/* Branding row */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          NagarSeva
        </p>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          Register a Civic Complaint
        </h1>
      </div>

      <div className="wizard-card">
        <StepIndicator currentStep={activeStep} />

        {activeStep === 1 && (
          <Step1_ImageCapture
            onNext={goNext}
          />
        )}
        {activeStep === 2 && (
          <Step2_LocationPin
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {activeStep === 3 && (
          <Step3_Description
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {activeStep === 4 && (
          <Step4_ReviewForm
            onBack={goBack}
            onGoToStep={goToStep}
          />
        )}
      </div>

      {/* Cancel link */}
      {activeStep < 4 && (
        <button
          onClick={() => {
            dispatch(resetComplaint());
            navigate('/citizen', { replace: true });
          }}
          style={{
            marginTop: 20,
            background: 'none',
            border: 'none',
            color: 'var(--color-muted)',
            fontSize: '0.8rem',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Cancel &amp; return to dashboard
        </button>
      )}
    </div>
  );
}
