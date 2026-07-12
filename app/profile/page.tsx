'use client'

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  User,
  Award,
  Heart,
  MapPin,
  Plane,
  Save,
  Trash2,
  Edit,
  Plus,
  AlertCircle
} from "lucide-react"

export default function ProfilePage() {
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  
  // Modal states
  const [licenseModalOpen, setLicenseModalOpen] = useState(false)
  const [aircraftModalOpen, setAircraftModalOpen] = useState(false)
  const [editingLicense, setEditingLicense] = useState<typeof licenses[0] | null>(null)
  const [editingAircraft, setEditingAircraft] = useState<typeof aircraft[0] | null>(null)

  const [personalInfo, setPersonalInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    postalCode: "",
    country: ""
  })

  const [licenses, setLicenses] = useState<any[]>([])

  const [medical, setMedical] = useState({
    class: "",
    certificateNumber: "",
    examinerName: "",
    issueDate: "",
    expirationDate: ""
  })

  const [homeAirport, setHomeAirport] = useState({
    icao: "",
    name: "",
    fbo: "",
    fuelType: ""
  })

  const [aircraft, setAircraft] = useState<any[]>([])


  
  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      try {
        const [profileRes, aircraftRes] = await Promise.all([
          fetch('/api/profile'),
          fetch('/api/user-aircraft'),
        ])

        if (profileRes.ok) {
          const data = await profileRes.json()
          const user = data.user
          const contact = data.contact || {}
          const profile = data.profile || {}
          const medicalData = data.medical || {}
          const lic = Array.isArray(data.licenses) ? data.licenses : []

          const nameParts = (user?.name || '').split(' ')
          if (!cancelled) {
            setPersonalInfo({
              firstName: nameParts[0] || '',
              lastName: nameParts.slice(1).join(' ') || '',
              email: user?.email || '',
              phone: contact?.phone || '',
              address1: contact?.address1 || '',
              address2: contact?.address2 || '',
              city: contact?.city || '',
              state: contact?.state || '',
              postalCode: contact?.postalCode || '',
              country: contact?.country || '',
            })

            setHomeAirport({
              icao: profile?.homeAirport || '',
              name: profile?.homeAirportName || '',
              fbo: profile?.homeAirportFbo || '',
              fuelType: profile?.homeAirportFuelType || '',
            })

            setMedical({
              class: medicalData?.medicalClass || '',
              certificateNumber: medicalData?.certificateNumber || '',
              examinerName: medicalData?.examinerName || '',
              issueDate: medicalData?.issueDate ? medicalData.issueDate.split('T')[0] : '',
              expirationDate: medicalData?.expirationDate ? medicalData.expirationDate.split('T')[0] : '',
            })

            setLicenses(lic.map((l: any, idx: number) => ({
              id: idx + 1,
              type: l.type || 'License',
              number: l.number || '',
              issueDate: l.issueDate ? l.issueDate.split('T')[0] : '',
              ratings: l.ratings ? JSON.parse(l.ratings) : [],
            })))
          }
        }

        if (aircraftRes.ok) {
          const aircraftData = await aircraftRes.json()
          if (!cancelled) setAircraft(aircraftData.aircraft || [])
        }
      } catch (error) {
        console.error('Failed to load profile', error)
      }
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [])

  // Handler functions
  const handleSavePersonalInfo = async () => {
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalInfo,
          homeAirport,
          medical,
          licenses,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save profile')
      }
      setUnsavedChanges(false)
      alert('Profile saved successfully!')
    } catch (error: any) {
      alert(error.message || 'Failed to save profile')
    }
  }
  
  const handleSaveMedical = async () => {
    return handleSavePersonalInfo()
  }
  
  const handleSaveAirport = async () => {
    return handleSavePersonalInfo()
  }
  
  const handleAddLicense = () => {
    setEditingLicense(null)
    setLicenseModalOpen(true)
  }
  
  const handleEditLicense = (license: typeof licenses[0]) => {
    setEditingLicense(license)
    setLicenseModalOpen(true)
  }
  
  const handleDeleteLicense = async (id: number) => {
    if (confirm('Are you sure you want to delete this license?')) {
      // TODO: API call to delete license
      setLicenses(licenses.filter(l => l.id !== id))
      alert('License deleted successfully!')
    }
  }
  
  const handleSaveLicense = (licenseData: typeof licenses[0]) => {
    if (editingLicense) {
      // Update existing
      setLicenses(licenses.map(l => l.id === licenseData.id ? licenseData : l))
    } else {
      // Add new
      const newLicense = { ...licenseData, id: Math.max(...licenses.map(l => l.id)) + 1 }
      setLicenses([...licenses, newLicense])
    }
    setLicenseModalOpen(false)
    setEditingLicense(null)
    alert('License saved successfully!')
  }
  
  const handleAddAircraft = () => {
    setEditingAircraft(null)
    setAircraftModalOpen(true)
  }
  
  const handleEditAircraft = (ac: typeof aircraft[0]) => {
    setEditingAircraft(ac)
    setAircraftModalOpen(true)
  }
  
  const handleDeleteAircraft = async (id: number) => {
    if (confirm('Are you sure you want to remove this aircraft?')) {
      // TODO: API call to delete aircraft
      setAircraft(aircraft.filter(a => a.id !== id))
      alert('Aircraft removed successfully!')
    }
  }
  
  const handleSaveAircraft = (aircraftData: typeof aircraft[0]) => {
    if (editingAircraft) {
      // Update existing
      setAircraft(aircraft.map(a => a.id === aircraftData.id ? aircraftData : a))
    } else {
      // Add new
      const newAircraft = { ...aircraftData, id: Math.max(...aircraft.map(a => a.id)) + 1 }
      setAircraft([...aircraft, newAircraft])
    }
    setAircraftModalOpen(false)
    setEditingAircraft(null)
    alert('Aircraft saved successfully!')
  }

  return (
    <div className="min-h-screen bg-background pt-[44px]">
      {/* Header */}
      <header className="sticky top-[44px] z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <User className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">Profile</span>
          </div>
          
          <div className="ml-auto flex items-center gap-4">
            {unsavedChanges && (
              <Badge variant="secondary" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                Unsaved changes
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <div className="mx-auto max-w-[1200px] space-y-6">
          {/* Profile Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
              <p className="text-muted-foreground">
                Manage your pilot information, licenses, and aircraft
              </p>
            </div>

          </div>

          {/* Tabs */}
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-5">
              <TabsTrigger value="personal" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden md:inline">Personal</span>
              </TabsTrigger>
              <TabsTrigger value="licenses" className="gap-2">
                <Award className="h-4 w-4" />
                <span className="hidden md:inline">Licenses</span>
              </TabsTrigger>
              <TabsTrigger value="medical" className="gap-2">
                <Heart className="h-4 w-4" />
                <span className="hidden md:inline">Medical</span>
              </TabsTrigger>
              <TabsTrigger value="airport" className="gap-2">
                <MapPin className="h-4 w-4" />
                <span className="hidden md:inline">Airport</span>
              </TabsTrigger>
              <TabsTrigger value="aircraft" className="gap-2">
                <Plane className="h-4 w-4" />
                <span className="hidden md:inline">Aircraft</span>
              </TabsTrigger>

            </TabsList>

            {/* Personal Information */}
            <TabsContent value="personal" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Update your personal details and contact information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input 
                        id="firstName" 
                        value={personalInfo.firstName}
                        onChange={(e) => {
                          setPersonalInfo({...personalInfo, firstName: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input 
                        id="lastName" 
                        value={personalInfo.lastName}
                        onChange={(e) => {
                          setPersonalInfo({...personalInfo, lastName: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      value={personalInfo.email}
                      onChange={(e) => {
                        setPersonalInfo({...personalInfo, email: e.target.value})
                        setUnsavedChanges(true)
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input 
                      id="phone" 
                      type="tel" 
                      value={personalInfo.phone}
                      onChange={(e) => {
                        setPersonalInfo({...personalInfo, phone: e.target.value})
                        setUnsavedChanges(true)
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address1">Address Line 1</Label>
                    <Input 
                      id="address1" 
                      value={personalInfo.address1}
                      onChange={(e) => {
                        setPersonalInfo({...personalInfo, address1: e.target.value})
                        setUnsavedChanges(true)
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address2">Address Line 2</Label>
                    <Input 
                      id="address2" 
                      value={personalInfo.address2}
                      onChange={(e) => {
                        setPersonalInfo({...personalInfo, address2: e.target.value})
                        setUnsavedChanges(true)
                      }}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input 
                        id="city" 
                        value={personalInfo.city}
                        onChange={(e) => {
                          setPersonalInfo({...personalInfo, city: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input 
                        id="state" 
                        value={personalInfo.state}
                        onChange={(e) => {
                          setPersonalInfo({...personalInfo, state: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postalCode">Postal Code</Label>
                      <Input 
                        id="postalCode" 
                        value={personalInfo.postalCode}
                        onChange={(e) => {
                          setPersonalInfo({...personalInfo, postalCode: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input 
                      id="country" 
                      value={personalInfo.country}
                      onChange={(e) => {
                        setPersonalInfo({...personalInfo, country: e.target.value})
                        setUnsavedChanges(true)
                      }}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => window.location.reload()}>Cancel</Button>
                      <Button className="gap-2" onClick={handleSavePersonalInfo}>
                        <Save className="h-4 w-4" />
                        Save Changes
                      </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Licenses & Certificates */}
            <TabsContent value="licenses" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>Licenses & Certificates</CardTitle>
                      <CardDescription>Manage your pilot certificates, ratings, and endorsements</CardDescription>
                    </div>
                    <Button size="sm" className="gap-2" onClick={handleAddLicense}>
                      <Plus className="h-4 w-4" />
                      Add License
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {licenses.map((license) => (
                    <div key={license.id} className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{license.type}</h3>
                            <Badge variant="secondary">{license.number}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">Issued: {license.issueDate}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEditLicense(license)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteLicense(license.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-sm font-medium mb-2">Ratings & Endorsements:</p>
                        <div className="flex flex-wrap gap-2">
                          {license.ratings.map((rating: string, idx: number) => (
                            <Badge key={idx} variant="outline">{rating}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Medical Certificate */}
            <TabsContent value="medical" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Medical Certificate</CardTitle>
                  <CardDescription>Keep your medical certificate information up to date</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="medicalClass">Medical Class</Label>
                      <Input 
                        id="medicalClass" 
                        value={medical.class}
                        onChange={(e) => {
                          setMedical({...medical, class: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="medicalNumber">Certificate Number</Label>
                      <Input 
                        id="medicalNumber" 
                        value={medical.certificateNumber}
                        onChange={(e) => {
                          setMedical({...medical, certificateNumber: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="examiner">Aviation Medical Examiner</Label>
                    <Input 
                      id="examiner" 
                      value={medical.examinerName}
                      onChange={(e) => {
                        setMedical({...medical, examinerName: e.target.value})
                        setUnsavedChanges(true)
                      }}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="issueDate">Issue Date</Label>
                      <Input 
                        id="issueDate" 
                        type="date" 
                        value={medical.issueDate}
                        onChange={(e) => {
                          setMedical({...medical, issueDate: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expirationDate">Expiration Date</Label>
                      <Input 
                        id="expirationDate" 
                        type="date" 
                        value={medical.expirationDate}
                        onChange={(e) => {
                          setMedical({...medical, expirationDate: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-chart-3 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Expiration Reminder</p>
                      <p className="text-xs text-muted-foreground">
                        Your medical certificate expires in 297 days. You'll receive reminders 90, 60, and 30 days before expiration.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => window.location.reload()}>Cancel</Button>
                    <Button className="gap-2" onClick={handleSaveMedical}>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Home Airport & Preferences */}
            <TabsContent value="airport" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Home Airport & Preferences</CardTitle>
                  <CardDescription>Set your default airport and aviation preferences</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="icao">ICAO Code</Label>
                      <Input 
                        id="icao" 
                        placeholder="KBOS"
                        value={homeAirport.icao}
                        onChange={(e) => {
                          setHomeAirport({...homeAirport, icao: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="airportName">Airport Name</Label>
                      <Input 
                        id="airportName" 
                        value={homeAirport.name}
                        onChange={(e) => {
                          setHomeAirport({...homeAirport, name: e.target.value})
                          setUnsavedChanges(true)
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fbo">Preferred FBO</Label>
                    <Input 
                      id="fbo" 
                      value={homeAirport.fbo}
                      onChange={(e) => {
                        setHomeAirport({...homeAirport, fbo: e.target.value})
                        setUnsavedChanges(true)
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fuelType">Preferred Fuel Type</Label>
                    <Input 
                      id="fuelType" 
                      value={homeAirport.fuelType}
                      onChange={(e) => {
                        setHomeAirport({...homeAirport, fuelType: e.target.value})
                        setUnsavedChanges(true)
                      }}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => window.location.reload()}>Cancel</Button>
                    <Button className="gap-2" onClick={handleSaveAirport}>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aircraft */}
            <TabsContent value="aircraft" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>Aircraft Assignments</CardTitle>
                      <CardDescription>Manage aircraft you fly regularly</CardDescription>
                    </div>
                    <Button size="sm" className="gap-2" onClick={handleAddAircraft}>
                      <Plus className="h-4 w-4" />
                      Add Aircraft
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {aircraft.map((ac) => (
                    <div key={ac.id} className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{ac.registration}</h3>
                            <Badge variant="secondary">{ac.ownership}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{ac.type}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEditAircraft(ac)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteAircraft(ac.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {ac.notes && (
                        <>
                          <Separator />
                          <p className="text-sm text-muted-foreground">{ac.notes}</p>
                        </>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>


          </Tabs>
        </div>
      </main>
    </div>
  )
}
