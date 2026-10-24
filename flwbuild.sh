docker tag jrnyflw-uat:latest "jrnyflw-uat:pre-$(date +%F-%H%M)"
DOCKER_BUILDKIT=1 docker build -f Dockerfile.uat -t jrnyflw-uat:latest .

