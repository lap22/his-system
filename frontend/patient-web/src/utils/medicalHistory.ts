export const medicalHistoryKeys = {
  all: (userId: string) => ['patientMedicalHistory', userId] as const,
  profile: (userId: string, patientProfileId: string) =>
    ['patientMedicalHistory', userId, patientProfileId] as const,
}

export function nextOwnedProfileId(
  currentId: string,
  profiles: ReadonlyArray<{ id: string; isDefault: boolean }>,
) {
  if (profiles.some((profile) => profile.id === currentId)) return currentId
  return profiles.find((profile) => profile.isDefault)?.id ?? profiles[0]?.id ?? ''
}
