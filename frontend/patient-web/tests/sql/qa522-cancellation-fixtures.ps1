param([switch]$PreflightOnly)
$ErrorActionPreference = 'Stop'
# Explicitly invoked test helper. Protocol and snapshots stay in memory; never emit credentials.
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$cfg = Get-Content -Raw -LiteralPath (Join-Path $root 'backend/HIS/HIS.Api/appsettings.Development.json') | ConvertFrom-Json
$builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($cfg.ConnectionStrings.DefaultConnection)
if ($builder.DataSource -ne 'localhost' -or $builder.InitialCatalog -ne 'HIS_DB' -or -not $builder.IntegratedSecurity) { throw 'Unexpected configured development SQL target.' }
$connection = [System.Data.SqlClient.SqlConnection]::new($builder.ConnectionString)
$all = @(
'a64f9cba-4ad9-4a39-9b17-475b19e29dce','8fcd366b-ee9c-495f-982a-3bd201765b66','aeed9b1b-c492-40cf-b9fb-b931239fd02f',
'913c4d31-9b54-4194-95bd-80b2c09990b6','1ca14418-e078-487f-9b45-7c291c41fe16','f394278a-987d-476c-8230-d68c23489737',
'a9af3ba6-af39-41a5-9705-000dec966c82','fb7b1e7e-cc37-47ac-ade2-5053a768a1de','dd54002e-2436-400b-ad32-cdd3dadebb52',
'1bcbad9c-45ee-45fa-bfa2-738cb0244ebe','0a07acf8-356b-4b49-9bb3-71db4587381c','c9e6fd79-7a30-4715-a35d-16b072984516',
'7bd54f06-cd84-4c7e-b27c-1073c8d04284','39258aac-45ac-49f3-9278-28bc24c396e5','2e5bb893-3075-4e10-92dc-f9e7b05229d2')
$ids = [ordered]@{ Departments=@($all[0]); Users=@($all[1],$all[2]); Doctors=@($all[3]); PatientProfiles=@($all[4],$all[5]); DoctorSchedules=@($all[6]); Appointments=@($all[7..14]); RefreshTokens=@() }
$tables = @('__EFMigrationsHistory','Appointments','Departments','Doctors','DoctorSchedules','MedicalRecords','PatientProfiles','PrescriptionItems','Prescriptions','QueueEntries','RefreshTokens','sysdiagrams','Users')
$expected = @{}; $immutable = @{}; $adopted = @{}; $baseline = $null; $started = $false; $tokenId = $null
$prefix = 'QA522-a64f9cba'
function Require($condition, $message) { if (-not $condition) { throw $message } }
function Command($sql, $tx, $parameters = @{}) {
    $cmd = $connection.CreateCommand()
    try {
        $cmd.Transaction = $tx; $cmd.CommandText = $sql; $cmd.CommandTimeout = 25
        foreach ($key in $parameters.Keys) { $value=$parameters[$key]; if ($null -eq $value) {$value=[DBNull]::Value}; [void]$cmd.Parameters.AddWithValue('@'+$key,$value) }
        return $cmd
    } catch { $cmd.Dispose(); throw }
}
function Scalar($sql, $tx=$null, $parameters=@{}) { $cmd=Command $sql $tx $parameters; try {return $cmd.ExecuteScalar()} finally {$cmd.Dispose()} }
function Exec($sql, $tx=$null, $parameters=@{}) { $cmd=Command $sql $tx $parameters; try {return $cmd.ExecuteNonQuery()} finally {$cmd.Dispose()} }
function JsonText($sql, $tx=$null) {
    $cmd=Command $sql $tx; $reader=$null
    try {
        $reader=$cmd.ExecuteReader(); $sb=[Text.StringBuilder]::new()
        while($reader.Read()){[void]$sb.Append($reader.GetString(0))}
        return $sb.ToString()
    } finally { try { if ($null -ne $reader) { $reader.Dispose() } } finally { $cmd.Dispose() } }
}
function IdList($values) { return (($values | ForEach-Object {"'$_'"}) -join ',') }
function Digest($text) { $sha=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()} }
function Snapshot($tx, [bool]$exclude) {
    Require ((Scalar "SELECT STRING_AGG(name,',') WITHIN GROUP (ORDER BY name) FROM sys.tables WHERE schema_id=SCHEMA_ID('dbo')" $tx) -eq ($tables -join ',')) 'Table inventory changed.'
    $rows=@();$lines=@()
    foreach($table in $tables){
        $filter='';if($exclude -and $ids.Contains($table) -and $ids[$table].Count -gt 0){$filter=' WHERE Id NOT IN ('+(IdList $ids[$table])+')'}
        $key='Id';if($table -eq '__EFMigrationsHistory'){$key='MigrationId'};if($table -eq 'sysdiagrams'){$key='diagram_id'}
        $cmd=Command "SELECT COUNT_BIG(*),CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE((SELECT d.* FROM dbo.[$table] d$filter ORDER BY [$key] FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')),2) FROM dbo.[$table]$filter" $tx
        $reader=$null
        try{$reader=$cmd.ExecuteReader();Require ($reader.Read()) 'Table fingerprint result missing.';$count=$reader.GetInt64(0);$hash=$reader.GetString(1)}
        finally{try{if($null -ne $reader){$reader.Dispose()}}finally{$cmd.Dispose()}}
        $rows+=@{table=$table;count=$count;sha256=$hash};$lines+="[dbo].[$table]|$count|$hash"
    }
    $profileFilter='';if($exclude){$profileFilter=' AND Id NOT IN ('+(IdList $ids.PatientProfiles)+')'}
    $defaults=JsonText "SELECT p.Id,CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT p.* FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)),2) SHA256 FROM dbo.PatientProfiles p WHERE IsDefault=1$profileFilter ORDER BY p.Id FOR JSON PATH" $tx
    # Catalog hash joins previously requested 11 MB and waited on RESOURCE_SEMAPHORE.
    # For this small metadata inventory, measured loop joins preserve identical JSON
    # while reducing the grant to about 1.3 MB. Keep the original command timeout.
    $schema=JsonText @"
SELECT (SELECT t.name,c.name columnName,ty.name typeName,c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.is_computed FROM sys.tables t JOIN sys.columns c ON t.object_id=c.object_id JOIN sys.types ty ON c.user_type_id=ty.user_type_id ORDER BY t.name,c.column_id FOR JSON PATH) columnsJson,
(SELECT name,parent_object_id,referenced_object_id,delete_referential_action,is_disabled,is_not_trusted FROM sys.foreign_keys ORDER BY name FOR JSON PATH) fksJson,
(SELECT name,parent_id,is_disabled,OBJECT_DEFINITION(object_id) definition FROM sys.triggers WHERE parent_class=1 ORDER BY name FOR JSON PATH) triggersJson,
(SELECT OBJECT_NAME(object_id) tableName,name,is_unique,filter_definition FROM sys.indexes WHERE object_id IN (SELECT object_id FROM sys.tables) ORDER BY object_id,index_id FOR JSON PATH) indexesJson FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES OPTION (LOOP JOIN)
"@ $tx
    return @{rows=$rows;digest=(Digest ($lines -join "`n"));defaults=$defaults;schema=(Digest $schema)}
}
function Same($left,$right,$stage) {Require ($left.digest -eq $right.digest -and $left.defaults -eq $right.defaults -and $left.schema -eq $right.schema) "Baseline/default/schema mismatch at $stage; no forced cleanup."}
function RowHash($table,$id,$tx=$null,[bool]$onlyImmutable=$false){
    $columns='d.*';if($onlyImmutable){$columns='d.Id,d.PatientProfileId,d.DoctorId,d.AppointmentDate,d.StartTime,d.EndTime,d.Symptoms,d.CreatedAt'}
    return Scalar "SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT $columns FROM dbo.[$table] d WHERE Id=@id FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)),2)" $tx @{id=[guid]$id}
}
function Preflight {
    Require ($env:ASPNETCORE_ENVIRONMENT -eq 'Development') 'Development opt-in missing.'
    Require ((Scalar "SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))+'|'+CONVERT(nvarchar(128),SERVERPROPERTY('Edition'))+'|'+DB_NAME()") -match '^LAPTOP-Q1E2KVS8\|.*Developer.*\|HIS_DB$') 'Unexpected SQL identity.'
    Require ((Scalar "SELECT CASE WHEN CONVERT(date,'20261022')>CONVERT(date,SYSDATETIMEOFFSET() AT TIME ZONE 'SE Asia Standard Time') AND DATENAME(weekday,CONVERT(date,'20261022'))='Thursday' THEN 1 ELSE 0 END") -eq 1) 'Fixture date is not future Thursday.'
    Require ((Scalar 'SELECT COUNT(*) FROM sys.foreign_keys') -eq 13 -and (Scalar 'SELECT COUNT(*) FROM sys.foreign_keys WHERE is_disabled=1 OR is_not_trusted=1') -eq 0 -and (Scalar 'SELECT COUNT(*) FROM sys.triggers WHERE parent_class=1') -eq 0) 'FK/trigger mismatch.'
    foreach($table in $ids.Keys){if($ids[$table].Count){Require ((Scalar "SELECT COUNT(*) FROM dbo.[$table] WHERE Id IN ($(IdList $ids[$table]))") -eq 0) 'Fixture ID collision.'}}
    Require ((Scalar "SELECT COUNT(*) FROM dbo.Users WHERE Email IN ('qa522-patient-a64f9cba@example.invalid','qa522-doctor-a64f9cba@example.invalid')") -eq 0) 'Synthetic email collision.'
    Require ((Scalar "SELECT COUNT(*) FROM dbo.Departments WHERE Name='$prefix Cancellation'") -eq 0 -and (Scalar "SELECT COUNT(*) FROM dbo.Doctors WHERE LicenseNumber='$prefix'") -eq 0) 'Synthetic unique field collision.'
    $tx=$connection.BeginTransaction([Data.IsolationLevel]::Serializable);try{$script:baseline=Snapshot $tx $false;$tx.Commit()}finally{$tx.Dispose()}
    Require ($baseline.digest -eq $env:HIS_BROWSER_BASELINE_SHA256) 'Fresh baseline differs from reviewed execution baseline.'
    $profiles=$baseline.defaults|ConvertFrom-Json
    Require ($profiles.Count -eq 2 -and @($profiles|Where-Object {$_.Id -eq '70182706-ed8a-45a7-88ca-b7a8c06302ae' -and $_.SHA256 -eq '19D6FC263B5E7EEDB675C5846FE08759A4EB341D246D795BED7F4B2B112343DC'}).Count -eq 1 -and @($profiles|Where-Object {$_.Id -eq '06f142bf-7a8e-4bc5-80b3-e30532224c85' -and $_.SHA256 -eq '194748A3DA529905497C435895DAB4ABADDFDB09740B3B61E7CBAB8FE83AF357'}).Count -eq 1) 'Original default profile fingerprints changed.'
    $badOrder=Scalar "WITH cleanup_order AS (SELECT * FROM (VALUES ('RefreshTokens',0),('Appointments',1),('DoctorSchedules',2),('PatientProfiles',3),('Doctors',4),('Users',5),('Departments',6)) p(name,seq)) SELECT COUNT(*) FROM sys.foreign_keys f JOIN cleanup_order c ON c.name=OBJECT_NAME(f.parent_object_id) JOIN cleanup_order p ON p.name=OBJECT_NAME(f.referenced_object_id) WHERE c.seq>=p.seq"
    Require ($badOrder -eq 0) 'Cleanup FK dependency order is invalid.'
    # Windows PowerShell uses .NET Framework; use the same package version's compatible asset.
    $bcrypt=Join-Path $env:USERPROFILE '.nuget/packages/bcrypt.net-next/4.2.0/lib/net462/BCrypt-Net-Next.dll'
    Add-Type -Path $bcrypt
    # Prove the private hash generator works before setup can write.
    $probe=[BCrypt.Net.BCrypt]::HashPassword([guid]::NewGuid().ToString());Require ($probe.Length -ge 50) 'BCrypt unavailable.';$probe=$null
    return @{baseline=$baseline;fixtureIds=$all;readOnly=$true;slots=9}
}
function Setup($password){
    Require (-not $PreflightOnly -and $env:HIS_BROWSER_ACCEPTANCE -eq 'APPROVED-FE-5.2.2' -and $null -ne $baseline -and -not $started) 'Explicit setup approval/guard missing.'
    $hash=[BCrypt.Net.BCrypt]::HashPassword($password);$t0=[DateTime]::UtcNow;$tx=$connection.BeginTransaction([Data.IsolationLevel]::Serializable)
    try{
        Same $baseline (Snapshot $tx $false) 'before setup'
        Require ((Exec 'INSERT dbo.Departments(Id,Name,IsActive,CreatedAt) VALUES(@id,@name,1,@t)' $tx @{id=[guid]$all[0];name="$prefix Cancellation";t=$t0}) -eq 1) 'Department insert count.'
        foreach($index in 1,2){$role='Patient';$who='patient';if($index -eq 2){$role='Doctor';$who='doctor'};Require ((Exec 'INSERT dbo.Users(Id,Email,PasswordHash,Role,IsActive,CreatedAt) VALUES(@id,@email,@hash,@role,1,@t)' $tx @{id=[guid]$all[$index];email="qa522-$who-a64f9cba@example.invalid";hash=$hash;role=$role;t=$t0}) -eq 1) 'User insert count.'}
        Require ((Exec 'INSERT dbo.Doctors(Id,UserId,DepartmentId,FullName,Specialization,LicenseNumber,YearsOfExperience,IsActive,CreatedAt) VALUES(@id,@user,@dept,@name,@special,@license,0,1,@t)' $tx @{id=[guid]$all[3];user=[guid]$all[2];dept=[guid]$all[0];name="$prefix Doctor";special='QA cancellation';license=$prefix;t=$t0}) -eq 1) 'Doctor insert count.'
        foreach($index in 4,5){$relation='Self';$default=$true;$birth=[datetime]'2000-01-01';if($index -eq 5){$relation='Child';$default=$false;$birth=[datetime]'2016-01-01'};Require ((Exec 'INSERT dbo.PatientProfiles(Id,UserId,FullName,DateOfBirth,Gender,Relationship,IsDefault,CreatedAt) VALUES(@id,@user,@name,@birth,@gender,@relation,@default,@t)' $tx @{id=[guid]$all[$index];user=[guid]$all[1];name="$prefix $relation";birth=$birth;gender='Other';relation=$relation;default=$default;t=$t0}) -eq 1) 'Profile insert count.'}
        Require ((Exec 'INSERT dbo.DoctorSchedules(Id,DoctorId,DayOfWeek,StartTime,EndTime,SlotDurationMinutes,MaxPatients,IsActive) VALUES(@id,@doctor,@day,@start,@end,30,9,1)' $tx @{id=[guid]$all[6];doctor=[guid]$all[3];day='Thursday';start=[timespan]'09:00:00';end=[timespan]'13:30:00'}) -eq 1) 'Schedule insert count.'
        $statuses=@('Pending','Confirmed','Pending','CheckedIn','InProgress','Completed','Cancelled','NoShow')
        for($slot=0;$slot -lt 8;$slot++){$start=[timespan]::FromMinutes(540+30*$slot);$profile=$all[4];if($slot -eq 1){$profile=$all[5]};$cancelled=$null;$reason=$null;if($slot -eq 6){$cancelled=$t0;$reason='QA522 pre-cancelled fixture'}
            Require ((Exec 'INSERT dbo.Appointments(Id,PatientProfileId,DoctorId,AppointmentDate,StartTime,EndTime,Status,CreatedAt,UpdatedAt,CancelledAt,CancellationReason) VALUES(@id,@profile,@doctor,@date,@start,@end,@status,@t,@cancelled,@cancelled,@reason)' $tx @{id=[guid]$all[7+$slot];profile=[guid]$profile;doctor=[guid]$all[3];date=[datetime]'2026-10-22';start=$start;end=$start.Add([timespan]::FromMinutes(30));status=$statuses[$slot];t=$t0;cancelled=$cancelled;reason=$reason}) -eq 1) 'Appointment insert count.'
        }
        foreach($table in $ids.Keys){foreach($id in $ids[$table]){$expected["$table/$id"]=RowHash $table $id $tx}}
        foreach($id in $ids.Appointments){$immutable[$id]=RowHash 'Appointments' $id $tx $true}
        Same $baseline (Snapshot $tx $true) 'after setup excluding exact fixtures'
        $tx.Commit();$script:started=$true
    }finally{$hash=$null;$tx.Dispose()}
    return @{inserted=15}
}
function CaptureToken {
    $tokenRows=JsonText "SELECT Id,UserId FROM dbo.RefreshTokens WHERE UserId IN ('$($all[1])','$($all[2])') FOR JSON PATH"
    $tokens=@();if($tokenRows){$tokens=$tokenRows|ConvertFrom-Json}
    Require ($tokens.Count -le 1 -and @($tokens|Where-Object {$_.UserId -ne $all[1]}).Count -eq 0) 'Unexpected authentication side effects.'
    if($tokens.Count -eq 1){$id=$tokens[0].Id;$rowHash=RowHash 'RefreshTokens' $id;if($tokenId){Require ($tokenId -eq $id -and $expected["RefreshTokens/$id"] -eq $rowHash) 'Test token changed.'}else{$script:tokenId=$id;$ids.RefreshTokens=@($id);$expected["RefreshTokens/$id"]=$rowHash}}
    return @{tokenId=$script:tokenId;count=$tokens.Count}
}
function Adopt($id){
    Require ($id -in $all[7..9] -and -not $adopted.ContainsKey($id)) 'Unapproved/repeated cancellation adoption.'
    $reason='QA522 cancellation reason';if($id -eq $all[8]){$reason=$null};if($id -eq $all[9]){$reason='QA522 uncertain outcome'}
    Require ((RowHash 'Appointments' $id $null $true) -eq $immutable[$id]) 'Cancellation changed immutable appointment fields.'
    $row=JsonText "SELECT Status,CancelledAt,UpdatedAt,CancellationReason FROM dbo.Appointments WHERE Id='$id' FOR JSON PATH,INCLUDE_NULL_VALUES"
    $row=$row|ConvertFrom-Json;Require ($row.Count -eq 1 -and $row[0].Status -eq 'Cancelled' -and $null -ne $row[0].CancelledAt -and $null -ne $row[0].UpdatedAt -and $row[0].CancellationReason -ceq $reason) 'Unexpected cancellation result.'
    $expected["Appointments/$id"]=RowHash 'Appointments' $id;$adopted[$id]=$true
    return @{id=$id;status='Cancelled';reason=$reason;updates=$adopted.Count}
}
function Cleanup {
    Require $started 'No setup committed; cleanup not applicable.'
    [void](CaptureToken)
    [void](Exec 'SET XACT_ABORT ON;')
    $tx=$connection.BeginTransaction([Data.IsolationLevel]::Serializable)
    try{
        Same $baseline (Snapshot $tx $true) 'before cleanup'
        foreach($table in $ids.Keys){foreach($id in $ids[$table]){Require ($expected["$table/$id"] -eq (RowHash $table $id $tx)) "Cleanup row guard failed: $table/$id"}}
        $deleted=0
        foreach($table in @('RefreshTokens','Appointments','DoctorSchedules','PatientProfiles','Doctors','Users','Departments')){foreach($id in $ids[$table]){Require ((Exec "DELETE FROM dbo.[$table] WHERE Id=@id" $tx @{id=[guid]$id}) -eq 1) 'Exact-ID cleanup delete count mismatch.';$deleted++}}
        Require ($deleted -eq (15+$ids.RefreshTokens.Count)) 'Unexpected cleanup total.'
        Same $baseline (Snapshot $tx $false) 'before cleanup commit';$tx.Commit();$script:started=$false
    }finally{$tx.Dispose()}
    $verify=$connection.BeginTransaction([Data.IsolationLevel]::Serializable);try{$final=Snapshot $verify $false;Same $baseline $final 'after cleanup';$verify.Commit()}finally{$verify.Dispose()}
    return @{deleted=$deleted;baselineRestored=$true;final=$final;updates=$adopted.Count;tokenId=$tokenId}
}
try {
    $connection.Open()
    if($PreflightOnly){$result=Preflight;[Console]::Out.WriteLine(($result|ConvertTo-Json -Depth 8 -Compress));exit 0}
    while($null -ne ($line=[Console]::ReadLine())){
        try{$request=$line|ConvertFrom-Json;$data=switch($request.op){'preflight'{Preflight};'setup'{Setup $request.password};'token'{CaptureToken};'adopt'{Adopt $request.id};'cleanup'{Cleanup};default{throw 'Unknown protocol operation.'}};[Console]::Out.WriteLine((@{ok=$true;data=$data}|ConvertTo-Json -Depth 10 -Compress))}
        catch{[Console]::Out.WriteLine((@{ok=$false;errorType=$_.Exception.GetType().Name;safeMessage= $(if($_.Exception -is [System.Data.SqlClient.SqlException]){'SQL guard/query failed; no forced operation.'}else{$_.Exception.Message})}|ConvertTo-Json -Compress))}
    }
} finally {
    try {
        if($started){try{$result=Cleanup;[Console]::Out.WriteLine((@{emergencyCleanup=$result}|ConvertTo-Json -Depth 10 -Compress))}catch{[Console]::Out.WriteLine((@{cleanupAborted=$true;knownFixtureIds=$all;tokenId=$tokenId}|ConvertTo-Json -Compress))}}
    } finally { $connection.Dispose() }
}
