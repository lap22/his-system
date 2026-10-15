/* FE 5.1.2 preflight: PREPARED ONLY. Not executed or write-authorized.
   Run only on an explicitly approved local-development connection to localhost/HIS_DB.
   Bind these SqlCommand parameters; never concatenate their values into SQL:
     @Execute bit (must be 1 after explicit execution approval)
     @ApiDefaultAppointmentId, @ApiFamilyAppointmentId,
     @ApiConflictAppointmentId, @ApiUncertainAppointmentId uniqueidentifier
     @TestRefreshTokenId uniqueidentifier
       Generated IDs may be NULL only for operations not completed in an aborted
       run. An unrecorded row still present makes the baseline comparison fail.
     @InsertedRowFingerprints nvarchar(max): one object per known inserted row
       Entity, Id, Sha256; captured immediately after each approved insert,
       before subsequent testing. Contains hashes and IDs only, never secrets.
   Unknown generated IDs or missing ledger entries must abort, never be inferred
   from a broad doctor/user/date query. Revalidate this baseline immediately before
   approving execution. Fingerprints use PK-ordered SQL JSON, INCLUDE_NULL_VALUES,
   Unicode input and SHA2_256. Per-row hashes use WITHOUT_ARRAY_WRAPPER.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF @Execute IS NULL OR @Execute <> 1
    THROW 51000, 'Cleanup is disabled pending explicit execution approval.', 1;
IF DB_NAME() <> N'HIS_DB'
    OR CONVERT(nvarchar(128), SERVERPROPERTY('ServerName')) <> N'LAPTOP-Q1E2KVS8'
    OR CONVERT(nvarchar(128), SERVERPROPERTY('Edition')) NOT LIKE N'%Developer%'
    THROW 51000, 'Unexpected database, instance or SQL Server edition.', 1;
IF ISJSON(@InsertedRowFingerprints) <> 1 OR @InsertedRowFingerprints IS NULL
    THROW 51000, 'Insert-time row fingerprint ledger is missing.', 1;

DECLARE @Doctor uniqueidentifier = 'c4b9ae3d-9340-497f-97f0-ed51181d0d97';
DECLARE @Patient uniqueidentifier = 'e7a9a589-e30f-4794-901a-1b69d37f9e06';
DECLARE @DoctorUser uniqueidentifier = '1d0225d8-94f5-41c7-afa5-706d9ab35a96';
DECLARE @Self uniqueidentifier = '9801bd33-44a6-448c-b115-ca43a1f7db15';
DECLARE @Child uniqueidentifier = 'd751cd47-73bf-43dd-bf72-f839e6c53b8c';
DECLARE @Date date = '2026-10-22';
DECLARE @Allowed TABLE (Entity sysname NOT NULL, Id uniqueidentifier NOT NULL PRIMARY KEY);
INSERT @Allowed VALUES
    (N'Departments','51c640d4-cc6d-4530-b268-40eb0a4a0a6a'),
    (N'Users',@Patient),(N'Users',@DoctorUser),(N'Doctors',@Doctor),
    (N'PatientProfiles',@Self),(N'PatientProfiles',@Child),
    (N'DoctorSchedules','3563cfc6-213a-4ac3-b21c-82eca6cde941'),
    (N'Appointments','6bcbb241-b11e-4a7a-a2f8-13e95282f471'),
    (N'Appointments','2275fe8e-8b56-465d-88cf-8dd75e469981');
INSERT @Allowed SELECT Entity,Id FROM (VALUES
    (N'Appointments',@ApiDefaultAppointmentId),(N'Appointments',@ApiFamilyAppointmentId),
    (N'Appointments',@ApiConflictAppointmentId),(N'Appointments',@ApiUncertainAppointmentId),
    (N'RefreshTokens',@TestRefreshTokenId)) generated(Entity,Id) WHERE Id IS NOT NULL;
DECLARE @KnownRows int=(SELECT COUNT(*) FROM @Allowed);
DECLARE @KnownAppointments int=(SELECT COUNT(*) FROM @Allowed WHERE Entity=N'Appointments');
DECLARE @KnownTokens int=(SELECT COUNT(*) FROM @Allowed WHERE Entity=N'RefreshTokens');
DECLARE @Ledger TABLE (Entity sysname, Id uniqueidentifier, Sha256 varchar(64));
INSERT @Ledger SELECT Entity,Id,Sha256 FROM OPENJSON(@InsertedRowFingerprints)
    WITH (Entity sysname,Id uniqueidentifier,Sha256 varchar(64));
IF (SELECT COUNT(*) FROM @Ledger) <> @KnownRows
    OR EXISTS (SELECT Id FROM @Ledger GROUP BY Id HAVING COUNT(*) <> 1)
    OR EXISTS (SELECT Entity,Id FROM @Allowed EXCEPT SELECT Entity,Id FROM @Ledger)
    OR EXISTS (SELECT Entity,Id FROM @Ledger EXCEPT SELECT Entity,Id FROM @Allowed)
    OR EXISTS (SELECT 1 FROM @Ledger WHERE Sha256 IS NULL OR LEN(Sha256) <> 64
        OR Sha256 COLLATE Latin1_General_100_BIN2 LIKE '%[^0-9A-F]%')
    THROW 51000, 'Insert-time ledger does not exactly match the known approved records.', 1;

-- Fresh read-only baseline: 2026-10-15 12:23:24 Asia/Ho_Chi_Minh.
DECLARE @Baseline TABLE (Entity sysname PRIMARY KEY, RowTotal bigint, Sha256 varchar(64), OrderColumn sysname);
INSERT @Baseline VALUES
 (N'__EFMigrationsHistory',9,'265157B4CDDA8713ADDA4570FBE39BF2C9003D0E4B79D95180B14F5EDB1984A5',N'MigrationId'),
 (N'Appointments',10,'199D8E7B70E572527CB86CC1B6E015386A6AAAC3717818597966109A2662D845',N'Id'),
 (N'Departments',2,'A6D6605364CC877DF6C450351FD40E90BCEC592A85D1834AA62E50065A9DA99F',N'Id'),
 (N'Doctors',4,'07B687AA0F3F76E34F0DAE38207F43F9F8C1FDA252B4F15A6F507D93DA519084',N'Id'),
 (N'DoctorSchedules',8,'20340A6E289124FD5BBE623DFE8D84C1908BD9ED1E49B074E680E7FA38FF65CA',N'Id'),
 (N'MedicalRecords',0,'5EE9173B1B564E61AFD2359A897C180B5EA83875A91A28537DF4202AAD4B3AA7',N'Id'),
 (N'PatientProfiles',5,'20573C6C6B701D1A6175A4E5CE321AF63842BC249D0502AEFEE57450A9F340BE',N'Id'),
 (N'PrescriptionItems',0,'5EE9173B1B564E61AFD2359A897C180B5EA83875A91A28537DF4202AAD4B3AA7',N'Id'),
 (N'Prescriptions',0,'5EE9173B1B564E61AFD2359A897C180B5EA83875A91A28537DF4202AAD4B3AA7',N'Id'),
 (N'QueueEntries',5,'A9A208A2673B61A3E01FB33021365E4C3F095941FBC4B2AF57E5F60E15EB9F95',N'Id'),
 (N'RefreshTokens',98,'003609A445FB59948A4A5754D604497AF594907AF2F788A9A1C766431251AE3A',N'Id'),
 (N'sysdiagrams',0,'5EE9173B1B564E61AFD2359A897C180B5EA83875A91A28537DF4202AAD4B3AA7',N'diagram_id'),
 (N'Users',16,'B24E1C3C1BEA0F75BB9995C19C3F64218B264701B09F2C2762B7884F769676CD',N'Id');

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @LockResult int;
    EXEC @LockResult = sys.sp_getapplock
        @Resource = N'appointment-booking:c4b9ae3d9340497f97f0ed51181d0d97:20261022',
        @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
    IF @LockResult < 0 THROW 51000, 'Could not acquire fixture booking lock.', 1;

    -- Never cascade-delete unexpected descendants, including non-FK DoctorId on QueueEntries.
    IF EXISTS (SELECT 1 FROM dbo.QueueEntries q WHERE q.DoctorId=@Doctor
        OR q.AppointmentId IN (SELECT Id FROM @Allowed WHERE Entity=N'Appointments'))
        OR EXISTS (SELECT 1 FROM dbo.MedicalRecords m WHERE m.DoctorId=@Doctor
        OR m.PatientProfileId IN (@Self,@Child)
        OR m.AppointmentId IN (SELECT Id FROM @Allowed WHERE Entity=N'Appointments'))
        THROW 51000, 'Unexpected queue or medical history; cleanup aborted.', 1;

    IF EXISTS (SELECT SCHEMA_NAME(schema_id),name FROM sys.tables WHERE is_ms_shipped=0
            EXCEPT SELECT N'dbo',Entity FROM @Baseline)
        OR EXISTS (SELECT N'dbo',Entity FROM @Baseline
            EXCEPT SELECT SCHEMA_NAME(schema_id),name FROM sys.tables WHERE is_ms_shipped=0)
        OR EXISTS (SELECT 1 FROM sys.triggers WHERE parent_class=1)
        THROW 51000, 'Table/trigger inventory changed; reinspect before cleanup.', 1;
    DECLARE @ForeignKeyHash varchar(64)=CONVERT(varchar(64),HASHBYTES('SHA2_256',(
        SELECT fk.name,OBJECT_SCHEMA_NAME(fk.parent_object_id) AS ChildSchema,
            OBJECT_NAME(fk.parent_object_id) AS ChildTable,pc.name AS ChildColumn,
            OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS ParentSchema,
            OBJECT_NAME(fk.referenced_object_id) AS ParentTable,rc.name AS ParentColumn,
            fk.delete_referential_action_desc AS DeleteAction,fk.is_disabled,fk.is_not_trusted
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
        JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id
        JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id
        ORDER BY fk.name,fkc.constraint_column_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2);
    IF @ForeignKeyHash IS NULL OR @ForeignKeyHash<>'4EAFAC39342F9368C93A01CC5CAED8757C24A688C14440793D3220710662C7B2'
        THROW 51000, 'Foreign-key definitions/trust differ; reinspect dependencies.', 1;

    -- Verify both original tables and inserted rows before deletion; then verify the
    -- full original baseline again after deletion, before COMMIT. Comparisons are
    -- explicitly NULL-safe. Exact JSON row hashes include all nullable columns.
    DECLARE @Pass int=0;
    WHILE @Pass < 2
    BEGIN
        DECLARE @Entity sysname, @Order sysname, @ExpectedCount bigint, @ExpectedHash varchar(64);
        DECLARE @ActualCount bigint, @ActualHash varchar(64), @Sql nvarchar(max), @Excluded nvarchar(max);
        DECLARE BaselineCursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT Entity,OrderColumn,RowTotal,Sha256 FROM @Baseline ORDER BY Entity;
        OPEN BaselineCursor;
        FETCH NEXT FROM BaselineCursor INTO @Entity,@Order,@ExpectedCount,@ExpectedHash;
        WHILE @@FETCH_STATUS=0
        BEGIN
            SELECT @Excluded=STRING_AGG(CONVERT(nvarchar(max),QUOTENAME(CONVERT(nvarchar(36),Id),'''')),N',')
                FROM @Allowed WHERE Entity=@Entity AND @Pass=0;
            DECLARE @Where nvarchar(max)=CASE WHEN @Excluded IS NULL THEN N'' ELSE N' WHERE Id NOT IN ('+@Excluded+N')' END;
            SET @Sql=N'SELECT @Count=COUNT_BIG(*),@Hash=CONVERT(varchar(64),HASHBYTES(''SHA2_256'',COALESCE((SELECT data.* FROM dbo.'
                +QUOTENAME(@Entity)+N' data'+@Where+N' ORDER BY '+QUOTENAME(@Order)
                +N' FOR JSON PATH,INCLUDE_NULL_VALUES),N''[]'')),2) FROM dbo.'+QUOTENAME(@Entity)+@Where+N';';
            EXEC sys.sp_executesql @Sql,N'@Count bigint OUTPUT,@Hash varchar(64) OUTPUT',@ActualCount OUTPUT,@ActualHash OUTPUT;
            IF @ActualCount IS NULL OR @ActualCount<>@ExpectedCount OR @ActualHash IS NULL OR @ActualHash<>@ExpectedHash
                THROW 51000, 'Original database counts/fingerprints differ; rollback required.', 1;
            FETCH NEXT FROM BaselineCursor INTO @Entity,@Order,@ExpectedCount,@ExpectedHash;
        END;
        CLOSE BaselineCursor;
        DEALLOCATE BaselineCursor;

        IF @Pass=0
        BEGIN
            DECLARE @Id uniqueidentifier,@RowHash varchar(64),@ExpectedRowHash varchar(64);
            DECLARE RowCursor CURSOR LOCAL FAST_FORWARD FOR SELECT Entity,Id,Sha256 FROM @Ledger ORDER BY Entity,Id;
            OPEN RowCursor;
            FETCH NEXT FROM RowCursor INTO @Entity,@Id,@ExpectedRowHash;
            WHILE @@FETCH_STATUS=0
            BEGIN
                SET @RowHash=NULL;
                SET @Sql=N'SELECT @Hash=CONVERT(varchar(64),HASHBYTES(''SHA2_256'',(SELECT data.* FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER)),2) FROM dbo.'+QUOTENAME(@Entity)+N' data WHERE Id=@Id;';
                EXEC sys.sp_executesql @Sql,N'@Id uniqueidentifier,@Hash varchar(64) OUTPUT',@Id,@RowHash OUTPUT;
                IF @RowHash IS NULL OR @RowHash<>@ExpectedRowHash
                    THROW 51000, 'A recorded test row is missing or changed; cleanup aborted.', 1;
                FETCH NEXT FROM RowCursor INTO @Entity,@Id,@ExpectedRowHash;
            END;
            CLOSE RowCursor;
            DEALLOCATE RowCursor;

            -- Validate the graph independently of the caller's fingerprint ledger.
            IF NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE Id='51c640d4-cc6d-4530-b268-40eb0a4a0a6a'
                    AND Name=N'QA51-c4b9ae3d Department' AND IsActive=1)
                OR (SELECT COUNT(*) FROM dbo.Users WHERE
                (Id=@Patient AND Email=N'qa51-c4b9ae3d-patient@his-test.invalid' AND Role=N'Patient' AND IsActive=1)
                OR (Id=@DoctorUser AND Email=N'qa51-c4b9ae3d-doctor@his-test.invalid' AND Role=N'Doctor' AND IsActive=1))<>2
                OR NOT EXISTS (SELECT 1 FROM dbo.Doctors WHERE Id=@Doctor AND UserId=@DoctorUser
                    AND DepartmentId='51c640d4-cc6d-4530-b268-40eb0a4a0a6a' AND LicenseNumber=N'QA51-c4b9ae3d' AND IsActive=1)
                OR (SELECT COUNT(*) FROM dbo.PatientProfiles WHERE UserId=@Patient AND
                    ((Id=@Self AND Relationship=N'Self' AND IsDefault=1) OR (Id=@Child AND Relationship=N'Child' AND IsDefault=0)))<>2
                OR NOT EXISTS (SELECT 1 FROM dbo.DoctorSchedules WHERE Id='3563cfc6-213a-4ac3-b21c-82eca6cde941'
                    AND DoctorId=@Doctor AND DayOfWeek=N'Thursday' AND StartTime='09:00' AND EndTime='12:00'
                    AND SlotDurationMinutes=30 AND MaxPatients=6 AND IsActive=1)
                THROW 51000, 'Fixture graph differs from the approved plan.', 1;
            DECLARE @Bookings TABLE (Id uniqueidentifier,ProfileId uniqueidentifier,StartTime time,EndTime time,Status nvarchar(50));
            INSERT @Bookings SELECT Id,ProfileId,StartTime,EndTime,Status FROM (VALUES
              ('6bcbb241-b11e-4a7a-a2f8-13e95282f471',@Self,'09:00','09:30',N'Completed'),
              ('2275fe8e-8b56-465d-88cf-8dd75e469981',@Self,'09:30','10:00',N'Pending'),
              (@ApiDefaultAppointmentId,@Self,'10:00','10:30',N'Pending'),
              (@ApiFamilyAppointmentId,@Child,'10:30','11:00',N'Pending'),
              (@ApiConflictAppointmentId,@Self,'11:00','11:30',N'Pending'),
              (@ApiUncertainAppointmentId,@Child,'11:30','12:00',N'Pending')
              ) expected(Id,ProfileId,StartTime,EndTime,Status) WHERE Id IS NOT NULL;
            IF (SELECT COUNT(*) FROM dbo.Appointments a JOIN @Bookings b ON b.Id=a.Id
                WHERE a.DoctorId=@Doctor AND a.PatientProfileId=b.ProfileId AND a.AppointmentDate=@Date
                AND a.StartTime=b.StartTime AND a.EndTime=b.EndTime AND a.Status=b.Status)<>@KnownAppointments
                OR (@TestRefreshTokenId IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM dbo.RefreshTokens WHERE Id=@TestRefreshTokenId AND UserId=@Patient AND RevokedAt IS NULL))
                THROW 51000, 'API appointments or authentication side effects differ from the approved plan.', 1;

            DELETE a FROM dbo.Appointments a JOIN @Allowed x ON x.Entity=N'Appointments' AND x.Id=a.Id;
            IF @@ROWCOUNT<>@KnownAppointments THROW 51000, 'Unexpected appointment deletion count.', 1;
            DELETE r FROM dbo.RefreshTokens r JOIN @Allowed x ON x.Entity=N'RefreshTokens' AND x.Id=r.Id;
            IF @@ROWCOUNT<>@KnownTokens THROW 51000, 'Unexpected token deletion count.', 1;
            DELETE s FROM dbo.DoctorSchedules s JOIN @Allowed x ON x.Entity=N'DoctorSchedules' AND x.Id=s.Id;
            IF @@ROWCOUNT<>1 THROW 51000, 'Unexpected schedule deletion count.', 1;
            DELETE p FROM dbo.PatientProfiles p JOIN @Allowed x ON x.Entity=N'PatientProfiles' AND x.Id=p.Id;
            IF @@ROWCOUNT<>2 THROW 51000, 'Unexpected profile deletion count.', 1;
            DELETE d FROM dbo.Doctors d JOIN @Allowed x ON x.Entity=N'Doctors' AND x.Id=d.Id;
            IF @@ROWCOUNT<>1 THROW 51000, 'Unexpected doctor deletion count.', 1;
            DELETE u FROM dbo.Users u JOIN @Allowed x ON x.Entity=N'Users' AND x.Id=u.Id;
            IF @@ROWCOUNT<>2 THROW 51000, 'Unexpected user deletion count.', 1;
            DELETE d FROM dbo.Departments d JOIN @Allowed x ON x.Entity=N'Departments' AND x.Id=d.Id;
            IF @@ROWCOUNT<>1 THROW 51000, 'Unexpected department deletion count.', 1;
        END;
        SET @Pass+=1;
    END;
    COMMIT TRANSACTION;
    SELECT Entity,Id AS DeletedId FROM @Allowed ORDER BY Entity,Id;
END TRY
BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
