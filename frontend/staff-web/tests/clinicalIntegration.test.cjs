const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const root = path.resolve(__dirname, '../../..')
const read = (relative) => readFileSync(path.join(root, relative), 'utf8')
const doctorPage = read('frontend/staff-web/src/pages/ClinicalExaminationPage.tsx')
const doctorDetail = read('frontend/staff-web/src/pages/DoctorAppointmentDetailsPage.tsx')
const staffContracts = read('frontend/staff-web/src/types/proposedMedicalRecords.ts')
const patientPage = read('frontend/patient-web/src/pages/MedicalHistoryPage.tsx')
const patientContracts = read('frontend/patient-web/src/types/medicalHistory.ts')
const patientRules = read('frontend/patient-web/src/utils/medicalHistory.ts')
const backendRequests = read('backend/HIS/HIS.Api/DTOs/MedicalRecords/MedicalRecordRequests.cs')
const backendResponse = read('backend/HIS/HIS.Api/DTOs/MedicalRecords/MedicalRecordResponse.cs')
const policy = read('backend/HIS/HIS.Api/Services/Clinical/MedicalRecordPolicy.cs')
const service = read('backend/HIS/HIS.Api/Services/Clinical/MedicalRecordApplicationService.cs')
const queueApi = read('frontend/staff-web/src/services/doctorQueueApi.ts')
const queueTypes = read('frontend/staff-web/src/types/doctorQueue.ts')

test('Doctor clinical entry and workspace both require InProgress', () => {
  assert.match(doctorDetail, /status === 'InProgress'/)
  assert.match(doctorPage, /appointment\.status !== 'InProgress'/)
})
test('Doctor ownership and active-profile checks are independently enforced by backend policy', () => {
  assert.match(policy, /doctorIsActive/); assert.match(policy, /authenticatedDoctorId != appointmentDoctorId/)
})
test('Draft content is nullable or incomplete across frontend and backend contracts', () => {
  assert.match(staffContracts, /proposedNullableContentSchema\.partial\(\)/)
  assert.match(backendRequests, /string\? ChiefComplaint/); assert.match(backendRequests, /string\? Diagnosis/)
})
test('finalization requires ChiefComplaint and Diagnosis in both layers', () => {
  assert.match(staffContracts, /clinicalFinalizationReviewSchema/)
  assert.match(backendRequests, /IsNullOrWhiteSpace\(ChiefComplaint\)/)
  assert.match(backendRequests, /IsNullOrWhiteSpace\(Diagnosis\)/)
})
test('Patient contract accepts Finalized status only while backend names remain exact', () => {
  assert.match(patientContracts, /z\.literal\('Finalized'\)/)
  assert.match(backendResponse, /Draft = 1/); assert.match(backendResponse, /Finalized = 2/)
})
test('PatientProfile switching and account keys cannot fall back to an all-profile clinical cache', () => {
  assert.match(patientPage, /nextOwnedProfileId/)
  assert.match(patientRules, /\['patientMedicalHistory', userId, patientProfileId\]/)
  assert.doesNotMatch(patientPage, /All Profiles/)
})
test('Doctor account changes and Patient account/profile changes isolate rendered clinical state', () => {
  assert.match(doctorPage, /reset\(emptyClinicalDraft\).*user\?\.userId/s)
  assert.match(patientPage, /auth\.user\?\.userId.*effectiveProfileId/)
})
test('Patient runtime presents no fabricated MedicalRecord entries', () => {
  assert.match(patientPage, /Electronic medical records are not yet available/)
  assert.doesNotMatch(patientPage, /<MedicalRecordDetail|records\.map/)
})
test('clinical content enters no browser persistence, logs or URL parameters', () => {
  const runtime = doctorPage + patientPage
  assert.doesNotMatch(runtime, /localStorage|sessionStorage|console\.|URLSearchParams/)
})
test('neither portal has an active clinical HTTP adapter', () => {
  const runtime = doctorPage + patientPage
  assert.doesNotMatch(runtime, /apiClient|axios|medicalRecordsApi|\bfetch\(/)
})
test('clinical finalization has no Queue completion call or side effect', () => {
  assert.doesNotMatch(service, /Queue|CompleteAsync|QueueEntry/)
  assert.doesNotMatch(doctorPage, /queueApi|completeQueue|Complete examination/)
})
test('Sprint 7 queue actions remain available and separate from clinical contracts', () => {
  for (const action of ['call', 'start', 'complete']) assert.match(queueTypes, new RegExp(action))
  assert.match(queueApi, /Queue\/\$\{entry\.id\}\/\$\{action\}/)
  assert.match(service, /AutomaticallyRetryMutations = false/)
})
