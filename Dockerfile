FROM public.ecr.aws/lambda/nodejs:20 AS base

WORKDIR /var/task

COPY package.json ./

RUN npm install

FROM base as processor
COPY dist/src/image-processing ./
CMD ["app.handler"]

FROM base as uploader
COPY dist/src/image-uploading ./
CMD ["app.handler"]