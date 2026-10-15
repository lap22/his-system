import type { Doctor } from '../types/doctorDirectory'

function searchable(value: string) {
  return value.trim().toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\u0111/g, 'd')
}

export function searchDoctors(doctors: readonly Doctor[], search: string): Doctor[] {
  const query = searchable(search)
  return doctors.filter((doctor) => doctor.isActive && (
    searchable(doctor.fullName).includes(query) || searchable(doctor.specialization).includes(query)
  ))
}
