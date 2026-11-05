export const CATEGORIES = ['Onboarding', 'Support', 'Fix', 'Update', 'Assistance', 'Internal', 'Meeting', 'Other']
export const SETUP_TYPES = ['PostX Organisation', 'Subgroups', 'Members', 'SLA', 'Quick Replies', 'Open Hours', 'WABAs', 'Routing', 'LiveChat', 'Automated Replies', 'Integration', 'Conexa', 'AI', 'Social Media Synced', 'Post Types', 'Review Boosted', 'Tested', 'Training']
export const QC_MESSAGE = 'Please complete the Onboarding QC checklist before marking this task as Completed.'
export function qcProgress(qc = {}) {
  const completed = SETUP_TYPES.filter(key => qc[key] === 'completed').length
  const notAcquired = SETUP_TYPES.filter(key => qc[key] === 'not_acquired').length
  return { completed, notAcquired, reviewed: completed + notAcquired, outstanding: SETUP_TYPES.length - completed - notAcquired }
}
export function needsQc(category, status, qc, previous) {
  return category === 'Onboarding' && status === 'completed' && !(previous?.status === 'completed' && previous?.category === 'Onboarding') && qcProgress(qc).outstanding > 0
}
