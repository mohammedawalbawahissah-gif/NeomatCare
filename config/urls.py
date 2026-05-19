from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from django.conf import settings
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

urlpatterns = [
    path('',              RedirectView.as_view(url='/api/docs/'), name='root'),
    path('admin/',        admin.site.urls),

    # Auth
    path('api/auth/',             include('apps.accounts.urls')),

    # Core
    path('api/facilities/',       include('apps.facilities.urls')),
    path('api/emergency-cases/',  include('apps.cases.urls')),
    path('api/referrals/',        include('apps.referrals.urls')),

    # New
    path('api/transport/',        include('apps.transport.urls')),
    path('api/consultations/',    include('apps.consultations.urls')),

    # Docs
    path('api/schema/',  SpectacularAPIView.as_view(),                          name='schema'),
    path('api/docs/',    SpectacularSwaggerView.as_view(url_name='schema'),     name='swagger-ui'),
    path('api/redoc/',   SpectacularRedocView.as_view(url_name='schema'),       name='redoc'),
    path('api/health/',  include('apps.referrals.health_urls')),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns = [path('__debug__/', include(debug_toolbar.urls))] + urlpatterns
