import { useState, useCallback } from 'react';
import { generateAnalysisPlan } from '../../api/api';

const INITIAL_STATE = {
  phase: 'idle',       // idle | loading | pending_approval | executing | complete | error
  plan: null,          // GeneratePlanResponse from server
  editedSteps: [],     // user-editable copy of plan.steps
  userConstraints: '',
  stepStatuses: {},    // { [step_id]: 'pending' | 'in_progress' | 'completed' | 'failed' }
  assumptions: [],     // [{ id, label, options: string[], selectedOption: string }]
  error: null,
};

export function useAnalysisPlan() {
  const [planState, setPlanState] = useState(INITIAL_STATE);

  const fetchPlan = useCallback(async (
    payload,
    conversationHistory = [],
    regenerationFeedback = null,
    previousPlanSteps = null,
  ) => {
    setPlanState(prev => ({ ...prev, phase: 'loading', error: null }));
    try {
      const plan = await generateAnalysisPlan(
        payload,
        conversationHistory,
        regenerationFeedback,
        previousPlanSteps,
      );
      const initialStatuses = {};
      (plan.steps || []).forEach(s => { initialStatuses[s.step_id] = 'pending'; });
      setPlanState(prev => ({
        ...prev,
        phase: 'pending_approval',
        plan,
        editedSteps: plan.steps ? [...plan.steps] : [],
        userConstraints: '',
        stepStatuses: initialStatuses,
        assumptions: plan.assumptions || [],
        error: null,
      }));
    } catch (err) {
      let message = err?.message || 'Plan generation failed.';
      if (err?.name === 'TimeoutError' || message.includes('timed out')) {
        message = 'Plan generation timed out. Try again or execute directly.';
      } else if (!navigator.onLine) {
        message = 'No network connection. Check your connection and retry.';
      }
      setPlanState(prev => ({ ...prev, phase: 'error', error: message }));
    }
  }, []);

  const updateStep = useCallback((stepId, changes) => {
    setPlanState(prev => ({
      ...prev,
      editedSteps: prev.editedSteps.map(s =>
        s.step_id === stepId ? { ...s, ...changes } : s
      ),
    }));
  }, []);

  const removeStep = useCallback((stepId) => {
    setPlanState(prev => ({
      ...prev,
      editedSteps: prev.editedSteps.filter(s => s.step_id !== stepId),
    }));
  }, []);

  const reorderSteps = useCallback((fromIndex, toIndex) => {
    setPlanState(prev => {
      const steps = [...prev.editedSteps];
      const [moved] = steps.splice(fromIndex, 1);
      steps.splice(toIndex, 0, moved);
      return { ...prev, editedSteps: steps };
    });
  }, []);

  const setConstraints = useCallback((text) => {
    setPlanState(prev => ({ ...prev, userConstraints: text }));
  }, []);

  const setAssumption = useCallback((assumptionId, value) => {
    setPlanState(prev => ({
      ...prev,
      assumptions: prev.assumptions.map(a =>
        a.id === assumptionId ? { ...a, selectedOption: value } : a
      ),
    }));
  }, []);

  const buildApprovedPlan = useCallback(() => {
    const { plan, editedSteps, userConstraints, assumptions } = planState;
    return {
      plan_id: plan?.plan_id || '',
      steps: editedSteps,
      user_constraints: userConstraints || null,
      assumptions: assumptions,
    };
  }, [planState]);

  const updateStepStatus = useCallback((data) => {
    const { step_id, status, error } = data;
    if (!step_id) return;
    setPlanState(prev => ({
      ...prev,
      stepStatuses: { ...prev.stepStatuses, [step_id]: status },
      // store error message on the step for display
      editedSteps: prev.editedSteps.map(s =>
        s.step_id === step_id ? { ...s, _error: error || null } : s
      ),
    }));
  }, []);

  const startExecuting = useCallback(() => {
    setPlanState(prev => {
      const statuses = {};
      prev.editedSteps.forEach(s => { statuses[s.step_id] = 'pending'; });
      return { ...prev, phase: 'executing', stepStatuses: statuses };
    });
  }, []);

  const completePlan = useCallback(() => {
    setPlanState(prev => ({ ...prev, phase: 'complete' }));
  }, []);

  const retryPlan = useCallback(() => {
    setPlanState(prev => {
      const statuses = {};
      prev.editedSteps.forEach(s => { statuses[s.step_id] = 'pending'; });
      return { ...prev, stepStatuses: statuses };
      // phase stays 'executing' — caller will restart the stream
    });
  }, []);

  const resetPlan = useCallback(() => {
    setPlanState(INITIAL_STATE);
  }, []);

  const addStep = useCallback(() => {
    const newStepId = `user-${Date.now()}`;
    const newStep = {
      step_id: newStepId,
      agent_name: '',
      task: '',
      description: 'New step',
      data_source: '',
      confidence: 'medium',
      rationale: '',
    };
    setPlanState(prev => ({
      ...prev,
      editedSteps: [...prev.editedSteps, newStep],
      stepStatuses: { ...prev.stepStatuses, [newStepId]: 'pending' },
    }));
    return newStepId;
  }, []);

  return {
    planState,
    fetchPlan,
    updateStep,
    removeStep,
    reorderSteps,
    setConstraints,
    setAssumption,
    buildApprovedPlan,
    updateStepStatus,
    startExecuting,
    completePlan,
    retryPlan,
    resetPlan,
    addStep,
  };
}

export default useAnalysisPlan;
