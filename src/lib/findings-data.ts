import caseData from '../../data/case.json'

export type Finding = {
  id: string
  eye: 'right' | 'left' | 'both' | null
  label: string
  value: string | number | null
  unit: string | null
  method: string | null
  available: boolean
  unavailable_reason?: string
}

export const CASE = caseData
export const FINDINGS = caseData.findings as Finding[]
