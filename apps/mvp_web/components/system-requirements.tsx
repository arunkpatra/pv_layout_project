import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@renewable-energy/ui/components/table"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { HardDrive } from "lucide-react"

const requirements = [
  { requirement: "Operating System", details: "Windows 10 or higher" },
  { requirement: "RAM", details: "8 GB minimum" },
  { requirement: "Disk Space", details: "500 MB free" },
  { requirement: "Additional Software", details: "None required" },
  {
    requirement: "Internet Connection",
    details: "Required for entitlement validation (Phase 2)",
  },
]

export function SystemRequirements() {
  return (
    <section className="bg-muted px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <HardDrive className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-xl">
                System Requirements
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Requirement</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map((row) => (
                  <TableRow key={row.requirement}>
                    <TableCell className="font-medium">
                      {row.requirement}
                    </TableCell>
                    <TableCell>{row.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
