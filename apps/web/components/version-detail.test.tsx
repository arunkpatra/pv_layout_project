import { test, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import type { VersionDetail as VersionDetailType } from "@renewable-energy/shared"

afterEach(() => cleanup())

const BASE_VERSION: VersionDetailType = {
  id: "ver_1",
  projectId: "prj_123",
  number: 1,
  label: null,
  status: "QUEUED",
  kmzS3Key: null,
  inputSnapshot: {},
  layoutJob: null,
  energyJob: null,
  createdAt: new Date(Date.now() - 30_000).toISOString(),
  updatedAt: new Date(Date.now() - 30_000).toISOString(),
}

const COMPLETE_VERSION: VersionDetailType = {
  ...BASE_VERSION,
  status: "COMPLETE",
  layoutJob: {
    id: "lj_1",
    status: "COMPLETE",
    kmzArtifactS3Key: "output/layout.kmz",
    svgArtifactS3Key: "output/layout.svg",
    dxfArtifactS3Key: "output/layout.dxf",
    statsJson: {
      total_tables: 120,
      total_modules: 3360,
      total_capacity_mwp: 1.949,
      total_area_acres: 8.4,
      num_icrs: 6,
      num_string_inverters: 42,
      total_dc_cable_m: 5200.5,
      total_ac_cable_m: 800.2,
      num_las: 12,
      row_pitch_m: 6.5,
      gcr_achieved: 0.346,
      inverter_capacity_kwp: 29.12,
    },
    errorDetail: null,
    startedAt: "2026-04-20T00:00:00Z",
    completedAt: "2026-04-20T00:05:00Z",
  },
  energyJob: null,
}

const ENERGY_COMPLETE_VERSION: VersionDetailType = {
  ...COMPLETE_VERSION,
  energyJob: {
    id: "ej_1",
    status: "COMPLETE",
    pdfArtifactS3Key: "output/report.pdf",
    statsJson: {
      irradiance_source: "PVGIS",
      ghi_kwh_m2_yr: 1850,
      gti_kwh_m2_yr: 2100,
      performance_ratio: 0.82,
      specific_yield_kwh_kwp_yr: 1722,
      year1_energy_mwh: 3356.7,
      cuf_pct: 19.7,
      lifetime_energy_mwh: 77450,
    },
    irradianceSource: "PVGIS",
    errorDetail: null,
    startedAt: "2026-04-20T00:05:00Z",
    completedAt: "2026-04-20T00:06:00Z",
  },
}

vi.mock("@/hooks/use-version", () => ({
  useVersion: vi.fn(),
}))

import { useVersion } from "@/hooks/use-version"
import { VersionDetail } from "./version-detail"

const mockUseVersion = vi.mocked(useVersion)

test("renders spinner and queued message when status is QUEUED", () => {
  mockUseVersion.mockReturnValue({
    data: { ...BASE_VERSION, status: "QUEUED" },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/your run is queued/i)).toBeInTheDocument()
  expect(document.querySelector(".animate-spin")).toBeInTheDocument()
})

test("renders spinner and processing message when status is PROCESSING", () => {
  mockUseVersion.mockReturnValue({
    data: { ...BASE_VERSION, status: "PROCESSING" },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/calculating layout/i)).toBeInTheDocument()
  expect(document.querySelector(".animate-spin")).toBeInTheDocument()
})

test("renders error alert and start new run link when status is FAILED", () => {
  mockUseVersion.mockReturnValue({
    data: {
      ...BASE_VERSION,
      status: "FAILED",
      layoutJob: {
        id: "lj_1",
        status: "FAILED",
        kmzArtifactS3Key: null,
        svgArtifactS3Key: null,
        dxfArtifactS3Key: null,
        statsJson: null,
        errorDetail: "KMZ parse error: no polygon boundaries found",
        startedAt: "2026-04-20T00:00:00Z",
        completedAt: "2026-04-20T00:01:00Z",
      },
      energyJob: null,
    },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/kmz parse error/i)).toBeInTheDocument()
  const link = screen.getByRole("link", { name: /start new run/i })
  expect(link.getAttribute("href")).toBe(
    "/dashboard/projects/prj_123/new-version",
  )
})

test("renders generic error message when both errorDetails are null", () => {
  mockUseVersion.mockReturnValue({
    data: { ...BASE_VERSION, status: "FAILED" },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument()
})

test("renders results grid with capacity and modules when COMPLETE", () => {
  mockUseVersion.mockReturnValue({
    data: COMPLETE_VERSION,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText("Capacity")).toBeInTheDocument()
  expect(screen.getByText("1.949 MWp")).toBeInTheDocument()
  expect(screen.getByText("Modules")).toBeInTheDocument()
  expect(screen.getByText("3360")).toBeInTheDocument()
  expect(screen.getByText("Tables")).toBeInTheDocument()
  expect(screen.getByText("120")).toBeInTheDocument()
})

test("renders complete badge with no grid when statsJson is null", () => {
  mockUseVersion.mockReturnValue({
    data: {
      ...BASE_VERSION,
      status: "COMPLETE",
      layoutJob: {
        id: "lj_1",
        status: "COMPLETE",
        kmzArtifactS3Key: "output/layout.kmz",
        svgArtifactS3Key: "output/layout.svg",
        dxfArtifactS3Key: "output/layout.dxf",
        statsJson: null,
        errorDetail: null,
        startedAt: "2026-04-20T00:00:00Z",
        completedAt: "2026-04-20T00:05:00Z",
      },
      energyJob: null,
    },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.queryByText("Capacity")).not.toBeInTheDocument()
  expect(
    screen.getByText(/statistics are not available/i),
  ).toBeInTheDocument()
})

test("renders loading state", () => {
  mockUseVersion.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

test("renders error state on query failure", () => {
  mockUseVersion.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/failed to load run details/i)).toBeInTheDocument()
})

test("renders error state when data is undefined and not loading", () => {
  mockUseVersion.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/failed to load run details/i)).toBeInTheDocument()
})

test("renders row pitch, GCR, and inverter capacity stat cards when COMPLETE", () => {
  mockUseVersion.mockReturnValue({
    data: COMPLETE_VERSION,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText("Row pitch")).toBeInTheDocument()
  expect(screen.getByText("6.5 m")).toBeInTheDocument()
  expect(screen.getByText("GCR")).toBeInTheDocument()
  expect(screen.getByText("0.346")).toBeInTheDocument()
  expect(screen.getByText("Inverter capacity")).toBeInTheDocument()
  expect(screen.getByText("29.12 kWp")).toBeInTheDocument()
})

test("renders energy pending state when energyJob is null", () => {
  mockUseVersion.mockReturnValue({
    data: COMPLETE_VERSION,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(
    screen.getByText(/energy calculation not yet available/i),
  ).toBeInTheDocument()
})

test("renders energy stat cards when energyJob is COMPLETE", () => {
  mockUseVersion.mockReturnValue({
    data: ENERGY_COMPLETE_VERSION,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText("Year 1 energy")).toBeInTheDocument()
  expect(screen.getByText("3356.7 MWh")).toBeInTheDocument()
  expect(screen.getByText("GHI")).toBeInTheDocument()
  expect(screen.getByText("1850 kWh/m²/yr")).toBeInTheDocument()
  expect(screen.getByText("CUF")).toBeInTheDocument()
  expect(screen.getByText("19.7 %")).toBeInTheDocument()
  expect(screen.getByText("Irradiance source")).toBeInTheDocument()
  expect(screen.getByText("PVGIS")).toBeInTheDocument()
})
