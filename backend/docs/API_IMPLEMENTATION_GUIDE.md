# API Implementation Guide
**Digital Evidence & Compliance Management Platform**

This guide provides detailed implementation patterns for building RESTful API endpoints following the platform's architectural standards.

---

## Table of Contents

1. [Controller Structure](#controller-structure)
2. [Authorization Patterns](#authorization-patterns)
3. [Request Validation](#request-validation)
4. [Response Formatting](#response-formatting)
5. [Error Handling](#error-handling)
6. [Pagination & Filtering](#pagination--filtering)
7. [File Upload/Download](#file-uploaddownload)
8. [Async Job Patterns](#async-job-patterns)
9. [Audit Logging](#audit-logging)
10. [Testing Patterns](#testing-patterns)

---

## Controller Structure

### Standard Controller Pattern

```python
# Example: StandardsController

class StandardsController:
    def __init__(self, standards_repo, auth_service, audit_service):
        self.standards = standards_repo
        self.auth = auth_service
        self.audit = audit_service
    
    async def index(self, request):
        """GET /api/v1/standards - List standards with filters"""
        
        # 1. Authenticate
        user = await self.auth.authenticate(request)
        
        # 2. Authorize (role check)
        await self.auth.require_permission(user, 'standard:view')
        
        # 3. Parse query params
        filters = self._parse_filters(request.query_params)
        pagination = self._parse_pagination(request.query_params)
        
        # 4. Apply object-level authorization
        if not user.is_admin():
            filters['accessible_by_user_id'] = user.id
        
        # 5. Fetch data
        standards = await self.standards.list(filters, pagination)
        total = await self.standards.count(filters)
        
        # 6. Return response
        return success_response(
            data=[s.to_dict() for s in standards],
            meta=pagination_meta(pagination, total)
        )
    
    async def show(self, request, standard_id: UUID):
        """GET /api/v1/standards/:id - Get standard detail"""
        
        # 1. Authenticate
        user = await self.auth.authenticate(request)
        
        # 2. Fetch entity
        standard = await self.standards.find_by_id(standard_id)
        if not standard:
            raise NotFoundError(f"Standard {standard_id} not found")
        
        # 3. Authorize (object-level)
        await self.auth.authorize(user, 'view', standard)
        
        # 4. Return response with related data
        return success_response(data={
            **standard.to_dict(),
            'evidence_requirements': [er.to_dict() for er in standard.evidence_requirements],
            'owner': standard.owner.to_dict() if standard.owner else None
        })
    
    async def store(self, request):
        """POST /api/v1/standards - Create standard"""
        
        # 1. Authenticate
        user = await self.auth.authenticate(request)
        
        # 2. Authorize
        await self.auth.require_permission(user, 'standard:manage')
        
        # 3. Validate request
        data = await self._validate_standard_create(request.body)
        
        # 4. Authorize parent access (axis)
        axis = await self.axes.find_by_id(data['axis_id'])
        await self.auth.authorize(user, 'manage_children', axis)
        
        # 5. Create entity
        standard = await self.standards.create({
            **data,
            'created_by': user.id,
            'updated_by': user.id
        })
        
        # 6. Audit log
        await self.audit.log(
            user=user,
            action='standard.created',
            entity_type='standard',
            entity_id=standard.id,
            after_value=standard.to_dict()
        )
        
        # 7. Return response
        return success_response(data=standard.to_dict(), status=201)
    
    async def update(self, request, standard_id: UUID):
        """PATCH /api/v1/standards/:id - Update standard"""
        
        user = await self.auth.authenticate(request)
        
        standard = await self.standards.find_by_id(standard_id)
        if not standard:
            raise NotFoundError(f"Standard {standard_id} not found")
        
        await self.auth.authorize(user, 'update', standard)
        
        data = await self._validate_standard_update(request.body)
        
        # Capture before state for audit
        before_value = standard.to_dict()
        
        # Update
        updated_standard = await self.standards.update(standard_id, {
            **data,
            'updated_by': user.id
        })
        
        # Audit log with before/after
        await self.audit.log(
            user=user,
            action='standard.updated',
            entity_type='standard',
            entity_id=standard_id,
            before_value=before_value,
            after_value=updated_standard.to_dict()
        )
        
        return success_response(data=updated_standard.to_dict())
    
    async def destroy(self, request, standard_id: UUID):
        """DELETE /api/v1/standards/:id - Soft delete standard"""
        
        user = await self.auth.authenticate(request)
        
        standard = await self.standards.find_by_id(standard_id)
        if not standard:
            raise NotFoundError(f"Standard {standard_id} not found")
        
        await self.auth.authorize(user, 'delete', standard)
        
        # Check if standard has active tasks
        if await self.standards.has_active_tasks(standard_id):
            raise BusinessLogicError(
                "Cannot delete standard with active tasks",
                error_code='standard.has_active_tasks'
            )
        
        # Soft delete
        await self.standards.soft_delete(standard_id, deleted_by=user.id)
        
        # Audit log
        await self.audit.log(
            user=user,
            action='standard.deleted',
            entity_type='standard',
            entity_id=standard_id,
            before_value=standard.to_dict()
        )
        
        return success_response(data={'deleted': True}, status=200)
```

---

## Authorization Patterns

### 1. Permission-Based Authorization (Role Check)

```python
# Check if user has permission
await auth.require_permission(user, 'evidence:review')

# Multiple permissions (user needs ANY)
await auth.require_any_permission(user, ['standard:manage', 'admin:full'])

# Multiple permissions (user needs ALL)
await auth.require_all_permissions(user, ['task:assign', 'task:view_all'])
```

### 2. Object-Level Authorization (Policy-Based)

```python
# Policy pattern
class StandardPolicy:
    def can_view(self, user, standard):
        # Admins and Deans can view all
        if user.has_role(['admin', 'dean']):
            return True
        
        # Consultants can view if they're the owner or reviewer
        if user.has_role('consultant'):
            return standard.owner_id == user.id or standard.reviewer_id == user.id
        
        # Employees can view standards in their assigned tasks
        return standard.has_task_assigned_to(user.id)
    
    def can_update(self, user, standard):
        if user.has_role(['admin', 'dean']):
            return True
        return False
    
    def can_delete(self, user, standard):
        return user.has_role('admin')

# Usage in controller
policy = StandardPolicy()
if not policy.can_view(user, standard):
    raise ForbiddenError("You are not authorized to view this standard")

# Or with helper
await auth.authorize(user, 'view', standard)  # internally calls policy
```

### 3. Scope-Based Authorization

```python
# Apply scope to query based on user role
async def apply_user_scope(query, user):
    if user.is_admin():
        return query  # no scope, can see all
    
    if user.has_role('dean'):
        return query  # deans can see all
    
    if user.has_role('consultant'):
        # consultants see standards they own or review
        return query.where(
            (Standard.owner_id == user.id) | 
            (Standard.reviewer_id == user.id)
        )
    
    if user.has_role('employee'):
        # employees see only standards with tasks assigned to them
        return query.join(Task).where(Task.assigned_to == user.id)
    
    return query.where(False)  # deny all by default
```

---

## Request Validation

### Validation Schema Pattern

```python
from pydantic import BaseModel, UUID4, Field, validator
from typing import Optional
from datetime import date

class CreateTaskRequest(BaseModel):
    evidence_requirement_id: UUID4
    assigned_to: UUID4
    title: str = Field(..., min_length=3, max_length=500)
    instructions: Optional[str] = None
    due_date: date
    priority: str = Field(default='normal', pattern='^(low|normal|high|critical)$')
    
    @validator('due_date')
    def due_date_must_be_future(cls, v):
        if v < date.today():
            raise ValueError('Due date must be in the future')
        return v
    
    @validator('assigned_to')
    def assigned_to_must_exist(cls, v):
        # Check user exists and is active
        user = UserRepository().find_by_id(v)
        if not user or not user.is_active:
            raise ValueError('Assigned user must be an active user')
        return v

# Usage in controller
async def store(self, request):
    try:
        data = CreateTaskRequest(**request.json())
    except ValidationError as e:
        raise ValidationError(
            title="Request validation failed",
            errors=e.errors()
        )
```

---

## Response Formatting

### Standard Success Response

```python
def success_response(data=None, meta=None, status=200):
    response = {
        'success': True,
        'data': data
    }
    if meta:
        response['meta'] = meta
    return JSONResponse(response, status_code=status)

# Pagination meta
def pagination_meta(page, per_page, total):
    return {
        'page': page,
        'per_page': per_page,
        'total': total,
        'total_pages': (total + per_page - 1) // per_page,
        'has_next': page * per_page < total,
        'has_prev': page > 1
    }
```

### Standard Error Response (RFC 7807)

```python
class ProblemDetail(Exception):
    def __init__(self, type, title, status, detail, errors=None):
        self.type = type
        self.title = title
        self.status = status
        self.detail = detail
        self.errors = errors or []
    
    def to_dict(self):
        return {
            'success': False,
            'error': {
                'type': self.type,
                'title': self.title,
                'status': self.status,
                'detail': self.detail,
                'errors': self.errors
            }
        }

# Predefined error types
class NotFoundError(ProblemDetail):
    def __init__(self, detail):
        super().__init__(
            type='https://errors.platform.sa/not-found',
            title='Resource Not Found',
            status=404,
            detail=detail
        )

class ValidationError(ProblemDetail):
    def __init__(self, title, errors):
        super().__init__(
            type='https://errors.platform.sa/validation',
            title=title,
            status=422,
            detail='The request body failed validation',
            errors=errors
        )

class ForbiddenError(ProblemDetail):
    def __init__(self, detail):
        super().__init__(
            type='https://errors.platform.sa/forbidden',
            title='Access Forbidden',
            status=403,
            detail=detail
        )
```

---

## Pagination & Filtering

### Query Parameter Parsing

```python
def parse_filters(query_params):
    filters = {}
    
    # Status filter
    if 'status' in query_params:
        filters['status'] = query_params['status']
    
    # Search query
    if 'q' in query_params:
        filters['search'] = query_params['q']
    
    # Date range
    if 'from_date' in query_params:
        filters['created_at__gte'] = query_params['from_date']
    if 'to_date' in query_params:
        filters['created_at__lte'] = query_params['to_date']
    
    # UUID filters
    if 'axis_id' in query_params:
        filters['axis_id'] = UUID(query_params['axis_id'])
    
    return filters

def parse_pagination(query_params):
    return {
        'page': int(query_params.get('page', 1)),
        'per_page': min(int(query_params.get('per_page', 20)), 100),  # max 100
        'sort': query_params.get('sort', 'created_at'),
        'direction': query_params.get('direction', 'desc')
    }
```

### Cursor-Based Pagination (for large datasets)

```python
async def list_with_cursor(self, request):
    cursor = request.query_params.get('cursor')
    per_page = int(request.query_params.get('per_page', 50))
    
    query = self.repo.query()
    
    if cursor:
        # Decode cursor (base64 encoded timestamp + ID)
        decoded = decode_cursor(cursor)
        query = query.where(
            (Entity.created_at < decoded['timestamp']) |
            ((Entity.created_at == decoded['timestamp']) & (Entity.id < decoded['id']))
        )
    
    items = await query.order_by(Entity.created_at.desc(), Entity.id.desc()).limit(per_page + 1).all()
    
    has_more = len(items) > per_page
    if has_more:
        items = items[:per_page]
    
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = encode_cursor({'timestamp': last.created_at, 'id': last.id})
    
    return success_response(
        data=[item.to_dict() for item in items],
        meta={
            'next_cursor': next_cursor,
            'has_more': has_more
        }
    )
```

---

## File Upload/Download

### File Upload Pattern

```python
async def upload_evidence(self, request):
    user = await self.auth.authenticate(request)
    
    # Parse multipart form
    form = await request.form()
    
    task_id = UUID(form['task_id'])
    evidence_requirement_id = UUID(form['evidence_requirement_id'])
    notes = form.get('notes', '')
    files = form.getlist('files')  # multiple files
    
    # Authorize
    task = await self.tasks.find_by_id(task_id)
    await self.auth.authorize(user, 'submit', task)
    
    # Validate file count
    evidence_req = await self.evidence_reqs.find_by_id(evidence_requirement_id)
    if len(files) > evidence_req.max_files:
        raise ValidationError(f"Maximum {evidence_req.max_files} files allowed")
    
    # Create submission
    submission = await self.submissions.create({
        'task_id': task_id,
        'evidence_requirement_id': evidence_requirement_id,
        'submitted_by': user.id,
        'notes': notes,
        'status': 'submitted'
    })
    
    # Upload files
    uploaded_files = []
    for file in files:
        # Validate file
        await self._validate_file(file, evidence_req)
        
        # Generate storage path
        stored_filename = f"{uuid4()}.{file.filename.split('.')[-1]}"
        storage_path = f"evidence/{task_id}/{stored_filename}"
        
        # Upload to object storage
        await self.storage.upload(
            bucket='evidence',
            path=storage_path,
            file=file.file,
            content_type=file.content_type
        )
        
        # Calculate checksum
        checksum = await self._calculate_sha256(file.file)
        
        # Save file metadata
        evidence_file = await self.evidence_files.create({
            'submission_id': submission.id,
            'original_filename': file.filename,
            'stored_filename': stored_filename,
            'storage_path': storage_path,
            'bucket': 'evidence',
            'mime_type': file.content_type,
            'file_size_bytes': file.size,
            'file_ext': file.filename.split('.')[-1],
            'checksum_sha256': checksum,
            'virus_scan_status': 'pending',
            'uploaded_by': user.id
        })
        
        uploaded_files.append(evidence_file)
        
        # Queue virus scan
        await self.queue.dispatch('virus-scan', {
            'file_id': evidence_file.id,
            'storage_path': storage_path
        })
    
    # Audit log
    await self.audit.log(
        user=user,
        action='evidence.submitted',
        entity_type='evidence_submission',
        entity_id=submission.id,
        after_value={'file_count': len(uploaded_files)}
    )
    
    # Notify reviewers
    await self.queue.dispatch('notification', {
        'type': 'submission.uploaded',
        'submission_id': submission.id
    })
    
    return success_response(data={
        'submission': submission.to_dict(),
        'files': [f.to_dict() for f in uploaded_files]
    }, status=201)
```

### File Download Pattern (Signed URLs)

```python
async def download_file(self, request, file_id: UUID):
    user = await self.auth.authenticate(request)
    
    # Find file
    file = await self.evidence_files.find_by_id(file_id)
    if not file:
        raise NotFoundError(f"File {file_id} not found")
    
    # Authorize (can user access this submission?)
    submission = await self.submissions.find_by_id(file.submission_id)
    await self.auth.authorize(user, 'view', submission)
    
    # Check virus scan status
    if file.virus_scan_status == 'infected':
        raise ForbiddenError("File is infected and cannot be downloaded")
    
    if file.virus_scan_status == 'pending':
        raise ValidationError("File is still being scanned, please try again later")
    
    # Generate signed URL (15-minute expiry)
    signed_url = await self.storage.generate_signed_url(
        bucket=file.bucket,
        path=file.storage_path,
        expires_in=900,  # 15 minutes
        filename=file.original_filename  # force download with original name
    )
    
    # Audit log download
    await self.audit.log(
        user=user,
        action='evidence_file.downloaded',
        entity_type='evidence_file',
        entity_id=file_id
    )
    
    # Redirect to signed URL
    return RedirectResponse(url=signed_url)
```

---

## Async Job Patterns

### Queuing Jobs

```python
# Dispatch async job
await queue.dispatch('calculate-completion', {
    'standard_id': standard.id
})

# Dispatch with delay
await queue.dispatch('send-reminder', {
    'task_id': task.id
}, delay_seconds=3600)

# Dispatch to specific queue
await queue.dispatch('generate-report', {
    'report_job_id': job.id
}, queue_name='reports-high-priority')
```

### Job Handler Pattern

```python
@job_handler('calculate-completion')
async def handle_calculate_completion(payload):
    standard_id = UUID(payload['standard_id'])
    
    try:
        # Recalculate standard
        standard_pct = await completion_engine.recalc_standard(standard_id)
        
        # Get parent axis
        standard = await standards_repo.find_by_id(standard_id)
        axis_pct = await completion_engine.recalc_axis(standard.axis_id)
        
        # Get parent perspective
        axis = await axes_repo.find_by_id(standard.axis_id)
        perspective_pct = await completion_engine.recalc_perspective(axis.perspective_id)
        
        # Recalc global
        global_pct = await completion_engine.recalc_global()
        
        # Refresh dashboard snapshots
        await dashboard.refresh_snapshots([standard_id])
        
        logger.info(f"Completion recalculated for standard {standard_id}: {standard_pct}%")
        
    except Exception as e:
        logger.error(f"Failed to recalculate completion for {standard_id}: {e}")
        raise  # will trigger retry

@job_handler('generate-report')
async def handle_generate_report(payload):
    job_id = UUID(payload['report_job_id'])
    
    try:
        # Update status
        await report_jobs.update(job_id, {'status': 'processing', 'started_at': datetime.utcnow()})
        
        job = await report_jobs.find_by_id(job_id)
        
        # Generate report based on type
        if job.report_type == 'self-assessment':
            output_path = await generators.generate_self_assessment(job.filters)
        elif job.report_type == 'evidence-register':
            output_path = await generators.generate_evidence_register(job.filters)
        # ... other types
        
        # Get file size
        file_size = await storage.get_file_size('reports', output_path)
        
        # Update job
        await report_jobs.update(job_id, {
            'status': 'completed',
            'output_path': output_path,
            'file_size_bytes': file_size,
            'completed_at': datetime.utcnow(),
            'expires_at': datetime.utcnow() + timedelta(days=7)
        })
        
        # Notify requester
        await queue.dispatch('notification', {
            'type': 'report.completed',
            'user_id': job.requested_by,
            'job_id': job_id
        })
        
    except Exception as e:
        # Mark as failed
        await report_jobs.update(job_id, {
            'status': 'failed',
            'error_message': str(e),
            'completed_at': datetime.utcnow()
        })
        
        # Notify requester + admin
        await queue.dispatch('notification', {
            'type': 'report.failed',
            'user_id': job.requested_by,
            'job_id': job_id
        })
        
        logger.error(f"Report generation failed for job {job_id}: {e}")
```

---

## Audit Logging

### Automatic Audit Logging

```python
# Middleware pattern for automatic audit logging
@audit_middleware
async def handle_request(request, call_next):
    user = getattr(request.state, 'user', None)
    
    # Skip audit for read-only operations
    if request.method in ['GET', 'HEAD', 'OPTIONS']:
        return await call_next(request)
    
    # Capture request
    request_body = await request.body()
    
    # Process request
    response = await call_next(request)
    
    # Log if mutation occurred
    if response.status_code in [200, 201, 204]:
        await audit_service.log({
            'user_id': user.id if user else None,
            'method': request.method,
            'path': request.url.path,
            'request_body': request_body,
            'ip_address': request.client.host,
            'user_agent': request.headers.get('user-agent'),
            'status_code': response.status_code
        })
    
    return response
```

### Explicit Audit Logging

```python
# Repository pattern with built-in audit
class AuditableRepository:
    async def create(self, data, user):
        entity = await self.db.insert(data)
        
        await self.audit.log(
            user=user,
            action=f'{self.entity_type}.created',
            entity_type=self.entity_type,
            entity_id=entity.id,
            after_value=entity.to_dict()
        )
        
        return entity
    
    async def update(self, entity_id, data, user):
        before = await self.find_by_id(entity_id)
        entity = await self.db.update(entity_id, data)
        
        await self.audit.log(
            user=user,
            action=f'{self.entity_type}.updated',
            entity_type=self.entity_type,
            entity_id=entity_id,
            before_value=before.to_dict(),
            after_value=entity.to_dict()
        )
        
        return entity
```

---

## Testing Patterns

### Controller Test Pattern

```python
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def authenticated_client(test_db, test_user):
    # Create test user with role
    user = test_user(role='consultant')
    token = generate_jwt(user)
    
    client = TestClient(app)
    client.headers['Authorization'] = f'Bearer {token}'
    return client, user

def test_list_standards_as_consultant(authenticated_client, test_db):
    client, user = authenticated_client
    
    # Seed test data
    axis = test_db.create_axis()
    standard1 = test_db.create_standard(axis_id=axis.id, owner_id=user.id)
    standard2 = test_db.create_standard(axis_id=axis.id)  # not owned by user
    
    # Request
    response = client.get('/api/v1/standards')
    
    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data['success'] is True
    assert len(data['data']) == 1  # only owned standard
    assert data['data'][0]['id'] == str(standard1.id)

def test_create_standard_unauthorized(authenticated_client, test_db):
    client, user = authenticated_client
    
    # Remove permission
    test_db.remove_permission(user, 'standard:manage')
    
    response = client.post('/api/v1/standards', json={
        'axis_id': str(uuid4()),
        'code': 'S1.1.1',
        'name_en': 'Test Standard',
        'name_ar': 'معيار اختبار'
    })
    
    assert response.status_code == 403
    assert 'not authorized' in response.json()['error']['detail'].lower()

def test_approval_triggers_completion_recalc(authenticated_client, test_db, mock_queue):
    client, reviewer = authenticated_client
    
    submission = test_db.create_submission(status='under_review')
    
    response = client.post(f'/api/v1/reviews', json={
        'submission_id': str(submission.id),
        'decision': 'approved'
    })
    
    assert response.status_code == 201
    
    # Assert async job was queued
    mock_queue.assert_dispatched('calculate-completion', {
        'standard_id': str(submission.evidence_requirement.standard_id)
    })
```

---

## Best Practices Checklist

### For Every Endpoint

- [ ] ✅ Authenticate user (JWT validation)
- [ ] ✅ Authorize action (permission check + object-level policy)
- [ ] ✅ Validate request body (Pydantic schema)
- [ ] ✅ Check entity exists before update/delete
- [ ] ✅ Soft delete instead of hard delete (where applicable)
- [ ] ✅ Audit log all mutations (create/update/delete)
- [ ] ✅ Return standard response envelope
- [ ] ✅ Handle errors with RFC 7807 Problem Details
- [ ] ✅ Use async for I/O operations
- [ ] ✅ Queue async jobs instead of blocking
- [ ] ✅ Apply user scope to queries (object-level authorization)
- [ ] ✅ Include relevant meta in response (pagination, counts)
- [ ] ✅ Set appropriate HTTP status codes
- [ ] ✅ Use transactions for multi-table mutations
- [ ] ✅ Validate business rules before persisting

---

## Additional Resources

- [ARCHITECTURE.md](../ARCHITECTURE.md) — Full architecture specification
- [api/openapi.v1.yaml](../api/openapi.v1.yaml) — OpenAPI contract
- [domain/module_boundaries.yaml](../domain/module_boundaries.yaml) — Module ownership
- [SECURITY.md](SECURITY.md) — Security implementation guide

---

*Last Updated: March 6, 2026*
